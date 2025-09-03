import axios from 'axios';
import tough from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config()

const user_agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0'
const cookieJar = new tough.CookieJar();
cookieJar.setCookie('SERVER_HALLGATO=fIBL8fkO3df05tu9NbIL01', `${process.env.BASE_URL}`);
const client = wrapper(axios.create({ jar: cookieJar, withCredentials: true, headers: { 'User-Agent': user_agent}}));

let courses = Array()

const saveData = (data) =>{
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
}

const loadData = () =>{
  if(fs.existsSync('data.json')){
    const file = fs.readFileSync('data.json', 'utf-8');
    if(!file){
      console.log("No data found in data.json");
      return;
    }
    courses = JSON.parse(file);
  }
}

loadData();

const parseCookiesToObject = (cookiesArray)=> {
  const cookieMap = {};

  for (const cookieHeader of cookiesArray) {
    const cookieStr = String(cookieHeader);
    
    let clean = cookieStr;
    if (cookieStr.startsWith('Cookie="')) {
      clean = cookieStr.replace(/^Cookie="/, '').replace(/"$/, '');
    }

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

const data = await fetchWithCookies(`${process.env.BASE_URL}/hallgato/api/Account/Authenticate`)
const cookieHeader = Object.entries(data.cookies).map(([key, value]) => `${key}=${value}`).join('; ');


const response = await client.get(`${process.env.BASE_URL}/hallgato/api/SubjectApplication/GetScheduledCourses?model.termId=70632`,{
    headers: {
        Authorization: `Bearer ${data.data.accessToken}`,
        Cookie: cookieHeader
    }
})

const arr = response.data.data.filter(x => x.isSigned == false)

const url = 'https://discord.com/api'

const sendMessage = async (content) => {
  axios.post(`${url}/channels/${process.env.DC_CHANNEL_ID}/messages`, {
    content: content
  }, {
    headers: {
      Authorization: `Bot ${process.env.DC_BOT_TOKEN}`,
    }
  })
}

if(courses.length == 0) {
    saveData(arr)
    console.log("Empty data.json, saving current courses.");
    
}else{
  arr.forEach(x => {
    const found = courses.find(c => c.code == x.code);
    if(x.registeredStudentsCount != found.registeredStudentsCount)
      sendMessage(`A ${found.classInstanceInfos[0].startTime}-${found.classInstanceInfos[0].endTime} idejű ${x.title} kurzús létszáma változott: ${found.registeredStudentsCount} -> ${x.registeredStudentsCount}`);
    if(x.maxLimit != found.maxLimit)
      sendMessage(`A ${found.classInstanceInfos[0].startTime}-${found.classInstanceInfos[0].endTime} idejű ${x.title} kurzús maximális létszáma változott: ${found.maxLimit} -> ${x.maxLimit}`);
  })
  saveData(arr)
}