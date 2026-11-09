const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=path.join(__dirname,'../src');let count=0;
for(const name of fs.readdirSync(src)){
const data=fs.readFileSync(path.join(src,name),'utf8');
if(name.endsWith('.gs')){new vm.Script(data,{filename:name});count++;}
if(name.endsWith('.html'))for(const match of data.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){new vm.Script(match[1],{filename:name});count++;}
}
const manifest=JSON.parse(fs.readFileSync(path.join(src,'appsscript.json'),'utf8'));
if(manifest.timeZone!=='Africa/Cairo')throw Error('Incorrect timezone');
console.log('Syntax/manifest verified:',count,'scripts');
