import axios from 'axios';
import tough from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import fs from 'fs';
import { randomInt } from 'crypto';
import logger from './logger.js';
import * as dotenv from 'dotenv';
dotenv.config()

const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0'
const cookieJar = new tough.CookieJar();
let logged = false

if (process.env.SERVER_COOKIE)
  cookieJar.setCookie(
    process.env.SERVER_COOKIE,
    process.env.BASE_URL
  );

const client = wrapper(
  axios.create({
    jar: cookieJar,
    withCredentials: true,
    headers: {
      'User-Agent': USER_AGENT
    }
  })
);

let previousCourses = Array()

const saveData = (data) => {
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
}

const loadData = () => {
  if (fs.existsSync('data.json')) {
    const file = fs.readFileSync('data.json', 'utf-8');
    if (!file) return;
    previousCourses = JSON.parse(file);
  }
}
loadData();

const login = async () => {
  logger.info("Authenticating...")
  try {
    const r = await client.post(`${process.env.BASE_URL}/hallgato/api/Account/Authenticate`, {
      username: process.env.CODE,
      password: process.env.PASSWORD
    });
      client.defaults.headers.common['Authorization'] = `Bearer ${r.data.data.accessToken}`
      if (r.status == 200) {
          logger.info(`Authentication success`)
          logged = true
      }else logger.error(`Error during Authentication: ${r.statusText}`)
  } catch (e) {
    logger.error(`Error during authentication: ${e.message}`);
  }
}

const refreshToken = async () => {
  try {
    logger.info('Updating token...')
    const r = await client.post(`${process.env.BASE_URL}/hallgato/api/Account/GetNewTokens`);
    client.defaults.headers.common['Authorization'] = `Bearer ${r.data.accessToken}`
  } catch (e) {
    logger.error(`Error during token update: ${e.message}`)
  }
}

const getCourses = async () => {
  refreshToken()
	logger.info(`Fetching courses...`)
  try {
    const schedules = (await client.get(`${process.env.BASE_URL}/hallgato/api/SubjectApplication/GetScheduledCourses?request.termId=70633`))
        .data
    logger.info(`Found ${schedules.length} courses`)
    return schedules
  } catch (e) {
    console.log(e)
    logger.error(`Error during fetching courses: ${e.message}`);
  }
}

const sendMessage = async (content) => {
  const dcClient = wrapper(
    axios.create({
        withCredentials: true,
        headers: {
          Authorization: `Bot ${process.env.DC_BOT_TOKEN}`
        }
    })
  );
  const url = 'https://discord.com/api'
  const channelId = await (await dcClient.post("https://discord.com/api/v10/users/@me/channels", {
    recipient_id: process.env.DC_USER_ID
  })).data.id

  try {
    await dcClient.post(`${url}/channels/${channelId}/messages`, {
      content: content
    })
  } catch (e) {
    console.log(e)
    logger.error(`Error during sending message: ${e.message}`);
  }
}


const checkCourses = async () => {
  logger.info('Checking courses... ');

  try {
    const currentCourses = (await getCourses()).data.filter(x => x.isSigned == false)
    if (previousCourses.length == 0) {
      saveData(currentCourses)
    } else {
      currentCourses.forEach(x => {
        const found = previousCourses.find(c => c.code == x.code);
        const { startTime, endTime } = x.classInstanceInfos[0];

        if (!found)
          return

        if (x.registeredStudentsCount != found.registeredStudentsCount)
          sendMessage(`A ${startTime}-${endTime} idejű ${x.title} kurzús létszáma változott: ${found.registeredStudentsCount} -> ${x.registeredStudentsCount}`);
        if (x.maxLimit != found.maxLimit)
          sendMessage(`A ${startTime}-${endTime} idejű ${x.title} kurzús maximális létszáma változott: ${found.maxLimit} -> ${x.maxLimit}`);
      })
      saveData(currentCourses)
      loadData();
      const baseCheck = 5; // in minutes
      const nextCheck = (baseCheck * 60 * 1000) + randomInt(0, 300000);
      logger.info(`Next check in ${Math.round(nextCheck / 1000)} seconds | ${new Date(Date.now() + nextCheck).toLocaleString()}`);
      setTimeout(checkCourses, nextCheck);
    }
  }
  catch (e) {
    logger.error(`Error during checking courses: ${e.message}`);
  }
}

(async () => {
  try {
    await sendMessage("NepBot started!");
      await login()
      if (logged) checkCourses();
  } catch (e) {
    logger.error(`Error during initial setup: ${e.message}`);
  }
})()