import axios from 'axios';
import tough from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import fs from 'fs';
import { randomInt } from 'crypto';
import * as dotenv from 'dotenv';
dotenv.config()

const user_agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0'
const cookieJar = new tough.CookieJar();
if(process.env.SERVER_COOKIE)
  cookieJar.setCookie(`${process.env.SERVER_COOKIE}`, `${process.env.BASE_URL}`);
const client = wrapper(axios.create({ jar: cookieJar, withCredentials: true, headers: { 'User-Agent': user_agent}}));

let previousCourses = Array()

const saveData = (data) =>{
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
}

const loadData = () =>{
  if(fs.existsSync('data.json')){
    const file = fs.readFileSync('data.json', 'utf-8');
    if(!file) return;
    previousCourses = JSON.parse(file);
  }
}
loadData();

const parseCookiesToObject = (cookiesArray)=> {
  const cookieMap = {};

  for (const cookieHeader of cookiesArray) {
    const cookieStr = String(cookieHeader);
    
    let clean = cookieStr;
    if (cookieStr.startsWith('Cookie="'))
      clean = cookieStr.replace(/^Cookie="/, '').replace(/"$/, '');

    const firstPart = clean.split(';')[0].trim();

    const [name, ...valueParts] = firstPart.split('=');
    const value = valueParts.join('=');

    cookieMap[name] = value;
  }

  return cookieMap;
}

const fetchWithCookies = async (url) => {
    const response = await client.post(url, {
        username: process.env.CODE,
        password: process.env.PASSWORD
    });
    
    const cookies = parseCookiesToObject(await cookieJar.getCookies(url));
    const { data } = response.data
    
    return {
        data,
        cookies: cookies
    };
}

const getCourses = async () => {
  const data = await fetchWithCookies(`${process.env.BASE_URL}/hallgato/api/Account/Authenticate`)
  const cookieHeader = Object.entries(data.cookies).map(([key, value]) => `${key}=${value}`).join('; ');
  
  return (await client.get(`${process.env.BASE_URL}/hallgato/api/SubjectApplication/GetScheduledCourses?model.termId=70632`,{
      headers: {
        Authorization: `Bearer ${data.data.accessToken}`,
        Cookie: cookieHeader
      }
  })).data
}

const sendMessage = async (content) => {
  const url = 'https://discord.com/api'

  axios.post(`${url}/channels/${process.env.DC_CHANNEL_ID}/messages`, {
    content: content
  }, {
    headers: {
      Authorization: `Bot ${process.env.DC_BOT_TOKEN}`,
    }
  })
}

const checkCourses = async () => {
  const now = new Date();
  console.log('Checked at ', now.toLocaleString());
  
  const currentCourses = (await getCourses()).data.filter(x => x.isSigned == false)
  if(previousCourses.length == 0) {
    saveData(currentCourses)
  }else{
    currentCourses.forEach(x => {
      const found = previousCourses.find(c => c.code == x.code);
      const { startTime, endTime } = x.classInstanceInfos[0];

      if(x.registeredStudentsCount != found.registeredStudentsCount)
        sendMessage(`A ${startTime}-${endTime} idejű ${x.title} kurzús létszáma változott: ${found.registeredStudentsCount} -> ${x.registeredStudentsCount}`);
      if(x.maxLimit != found.maxLimit)
        sendMessage(`A ${startTime}-${endTime} idejű ${x.title} kurzús maximális létszáma változott: ${found.maxLimit} -> ${x.maxLimit}`);
    })
    saveData(currentCourses)
    loadData();
    const baseCheck = 5; // in minutes
    const nextCheck = (baseCheck * 60 * 1000) + randomInt(0, 300000);
    console.log(`Next check in ${Math.round(nextCheck / 1000)} seconds | ${new Date(Date.now() + nextCheck).toLocaleString()}`);
    setTimeout(checkCourses, nextCheck);
  }
}

checkCourses();