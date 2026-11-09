// Local in-memory Google-service adapters. Executes the real .gs files unchanged.
// This deliberately does not reproduce Google's permissions, quotas or persistence.
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function createRuntime(options={}) {
  const state={active:'omar@example.test',effective:'omar@example.test',sheets:new Map(),props:{STORE_ADMIN_EMAILS:'omar@example.test,mustafa@example.test'},cache:new Map(),lock:false,opens:[],creates:[],activeReads:0,...options};
  class Range {
    constructor(sheet,row,col,height=1,width=1) {if(![row,col,height,width].every(n=>Number.isInteger(n)&&n>=1)||row+height-1>sheet.getMaxRows()||col+width-1>sheet.getMaxColumns())throw Error('Range exceeds grid limits');Object.assign(this,{sheet,row,col,height,width});}
    getValues(){return Array.from({length:this.height},(_,r)=>Array.from({length:this.width},(_,c)=>this.sheet.data[this.row+r-1]?.[this.col+c-1]??''));}
    setValues(values){for(let r=0;r<this.height;r++)for(let c=0;c<this.width;c++){const idx=this.row+r-1;this.sheet.data[idx]??=[];const v=values[r][c];this.sheet.data[idx][this.col+c-1]=typeof v==='string'&&v.startsWith("'")?v.slice(1):v;}return this;}
    setValue(v){return this.setValues([[v]]);}
    record(key,valueName,value){this.sheet[key].push({row:this.row,col:this.col,height:this.height,width:this.width,[valueName]:value});return this;}
    setNumberFormat(format){return this.record('numberFormats','format',format);}
    setFontWeight(value){return this.record('styles','fontWeight',value);} setBackground(value){return this.record('styles','background',value);}
    setDataValidation(rule){return this.record('validations','rule',rule);}
    getNumberFormats(){return Array.from({length:this.height},(_,r)=>Array.from({length:this.width},(_,c)=>{const row=this.row+r,col=this.col+c;const matches=this.sheet.numberFormats.filter(v=>row>=v.row&&row<v.row+v.height&&col>=v.col&&col<v.col+v.width);return matches.at(-1)?.format||'General';}));}
    getNumberFormat(){return this.getNumberFormats()[0][0];}
  }
  class Sheet {
    constructor(name){this.name=name;this.data=[];this.numberFormats=[];this.validations=[];this.styles=[];this.frozenRows=0;this.maxRows=1000;this.maxColumns=26;this.gridChanges=[];}
    getName(){return this.name;}
    getRange(...args){return new Range(this,...args);} getLastRow(){return this.data.length;} getLastColumn(){return Math.max(0,...this.data.map(r=>r.length));}
    getDataRange(){return this.getRange(1,1,Math.max(1,this.getLastRow()),Math.max(1,this.getLastColumn()));}
    getMaxRows(){return this.maxRows;} getMaxColumns(){return this.maxColumns;}
    insertColumnsAfter(after,count){this.gridChanges.push({kind:'columns',after,count});if(after<1||after>this.maxColumns)throw Error('Invalid column expansion');for(const row of this.data)if(after<row.length)row.splice(after,0,...Array(count).fill(''));this.maxColumns+=count;return this;}
    insertRowsAfter(after,count){this.gridChanges.push({kind:'rows',after,count});if(after<1||after>this.maxRows)throw Error('Invalid row expansion');if(after<this.data.length)this.data.splice(after,0,...Array.from({length:count},()=>[]));this.maxRows+=count;return this;} setFrozenRows(count){this.frozenRows=count;} deleteRow(row){this.data.splice(row-1,1);}
  }
  class Spreadsheet {
    constructor(id){this.id=id;this.tabs=new Map();this.meta=[];}
    addDeveloperMetadata(key,value){this.meta.push({getKey:()=>key,getValue:()=>value});return this;}
    getDeveloperMetadata(){return this.meta;} getSheets(){return Array.from(this.tabs.values());} setSpreadsheetTimeZone(zone){this.zone=zone;}
    getId(){return this.id;} getUrl(){return 'https://docs.google.com/spreadsheets/d/'+this.id;}
    getSheetByName(name){return this.tabs.get(name)||null;} insertSheet(name){const s=new Sheet(name);this.tabs.set(name,s);return s;}
  }
  if(!Object.hasOwn(options,'activeSpreadsheet')){
    const bound=new Spreadsheet('local-bound-sheet');bound.insertSheet('Sheet1');state.sheets.set(bound.id,bound);state.activeSpreadsheet=bound;
  }
  class ValidationBuilder {
    constructor(){this.rule={allowInvalid:true};}
    requireFormulaSatisfied(formula){Object.assign(this.rule,{criteria:'formula',formula});return this;}
    requireValueInList(values,showDropdown){Object.assign(this.rule,{criteria:'list',values,showDropdown});return this;}
    requireNumberBetween(min,max){Object.assign(this.rule,{criteria:'numberBetween',min,max});return this;}
    setAllowInvalid(value){this.rule.allowInvalid=value;return this;}
    setHelpText(value){this.rule.helpText=value;return this;}
    build(){return {...this.rule};}
  }
  const cache={put:(k,v,ttl)=>state.cache.set(k,{value:v,expires:Date.now()+ttl*1000}),get:k=>{const v=state.cache.get(k);return v&&v.expires>Date.now()?v.value:null;},remove:k=>state.cache.delete(k)};
  const context=vm.createContext({console:{log(){}},Date,Math,JSON,Object,Array,String,Number,Boolean,RegExp,Error,Set,Map,
    Session:{getActiveUser:()=>({getEmail:()=>state.active}),getEffectiveUser:()=>({getEmail:()=>state.effective})},
    ScriptApp:{getScriptId:()=> 'LOCAL-INDEPENDENT-BRAND-STORE'},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>state.props[k]??null,setProperty:(k,v)=>{state.props[k]=String(v);}})},
    CacheService:{getScriptCache:()=>cache},
    LockService:{getScriptLock:()=>({tryLock:()=>{if(state.lock)return false;state.lock=true;return true;},releaseLock:()=>{state.lock=false;}})},
    Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,s)=>Array.from(crypto.createHash('sha256').update(String(s)).digest()).map(n=>n>127?n-256:n)},
    SpreadsheetApp:{getActiveSpreadsheet:()=>{state.activeReads++;return state.activeSpreadsheet||null;},newDataValidation:()=>new ValidationBuilder(),create:()=>{state.creates.push(true);const id=crypto.randomUUID();const ss=new Spreadsheet(id);state.sheets.set(id,ss);return ss;},openById:id=>{state.opens.push(id);const ss=state.sheets.get(id);if(!ss)throw Error('Unknown spreadsheet');return ss;},flush:()=>{}},
  });
  const src=options.sourceDir?path.resolve(options.sourceDir):path.join(__dirname,'../src');
  for (const file of fs.readdirSync(src).filter(f=>f.endsWith('.gs')).sort())vm.runInContext(fs.readFileSync(path.join(src,file),'utf8'),context,{filename:file});
  if(options.setup!==false){const result=context.setupStore();if(!result.ok)throw Error(JSON.stringify(result));}
  return {context,state,call:(name,arg)=>context[name](arg),read:name=>JSON.parse(JSON.stringify(context.rows_(name))),setting:(key,value)=>context.patch_('Settings',key,{value}),ageToken:token=>{state.cache.get('checkout:'+context.sha256_(token)).value=String(Date.now()-10000);}};
}
module.exports={createRuntime};
