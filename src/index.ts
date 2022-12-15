import axios, { AxiosResponse } from 'axios';
import { GistBox } from 'gist-box';
import table from 'text-table';
import cheerio from 'cheerio';
require('dotenv').config();

const FOLLOWERS_COUNT_REGEX = /[\d+*\.*A-Z?]*\sFollowers/;
// const CLAPS_COUNT_REGEX = /\d+(\.\d{1,2})?K?\s?/;
const CLAPS_COUNT_REGEX = /clapCount":(.*?),/;
const MAX_STR_LENGTH = 30;
const MEDIUM_API_BASE_URL =
  'https://api.rss2json.com/v1/api.json?rss_url=https://medium.com/feed/@';
const MEDIUM_PROFILE_BASE_URL = 'https://medium.com/@';

interface IMappedData {
  title: string;
  claps: string;
}

type ItemData = {
  title: string;
  guid: string;
  categories: string[];
};

interface APIResponse {
  items: ItemData[];
}

(async () => {
  const { GIST_ID, GH_PAT, MEDIUM_USER_NAME } = process.env;
  let apiResponse: AxiosResponse<APIResponse>;
  let followerCount: string;
  let slicedData: IMappedData[];
  let articlesContent: string[][] = [];

  if (!GIST_ID || !GH_PAT || !MEDIUM_USER_NAME) return;

  try {
    // Get user's medium data from rss API
    apiResponse = await axios.get(MEDIUM_API_BASE_URL + MEDIUM_USER_NAME);

    // Use cheerio to get articles' claps count
    slicedData = await Promise.all(
      apiResponse.data.items
        .filter((item) => item.categories.length !== 0) // filter comment
        .map(async (item) => {
          const res = await axios.get(item.guid);
          // const $ = cheerio.load(res.data);
          // const text = $('div.pw-multi-vote-count button').first().text();
          let matches = res.data.match(CLAPS_COUNT_REGEX);
          return { title: item.title, claps: matches ? matches[1] : '0' };
        })
    );
    slicedData = slicedData
      .sort((a, b) => {
        return parseInt(b.claps, 10) - parseInt(a.claps, 10);
      })
      .slice(0, 3);
    // console.log(slicedData);
  } catch (err) {
    throw new Error('Get data failed');
  }

  // Get user's follower count
  const res = await axios.get(MEDIUM_PROFILE_BASE_URL + MEDIUM_USER_NAME);
  const $ = cheerio.load(res.data);
  const followerCountMatchList = $('a').text().match(FOLLOWERS_COUNT_REGEX);
  // console.log($('a').text().match(FOLLOWERS_COUNT_REGEX));
  followerCount = followerCountMatchList
    ? followerCountMatchList[0]
    : '??? Followers';

  slicedData.forEach((item) => {
    let trimTitle;
    if (item.title.length > MAX_STR_LENGTH)
      trimTitle = item.title.slice(0, MAX_STR_LENGTH) + '...';
    else trimTitle = item.title;
    articlesContent.push([`👉 ${trimTitle}`, `👏 ${item.claps}`]);
  });

  if (slicedData.length === 0) {
    articlesContent.push(['I have no posts in Medium currently...', '😢']);
  }

  const gistContent = table(
    [
      [`@${MEDIUM_USER_NAME}`, `${followerCount} 🕴`],
      ['Latest Articles', '👇'],
      ...articlesContent,
    ],
    { align: ['l', 'r'], stringLength: () => 20 }
  );

  console.log(gistContent);

  const box = new GistBox({ id: GIST_ID, token: GH_PAT });

  try {
    await box.update({ filename: 'medium-stat.md', content: gistContent });
  } catch (err) {
    throw new Error('Update gist failed');
  }
})();
