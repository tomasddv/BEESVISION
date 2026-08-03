const APP_PIN='galaxia2026';
const SHEETS={BASE:'BASE_EDF',SURVEYS:'RELEVAMIENTOS'};
const BASE_HEADERS=['clientCode','clientName','assetNumber','assetType','model','contract','status','sourceFile','sourceSheet','sourceRow'];
const SURVEY_HEADERS=['id','createdAt','user','clientCode','clientName','location','systemNumber','foundNumber','status','comment','note'];

function doGet(){
  return HtmlService.createHtmlOutputFromFile('Index').setTitle('Relevamiento EDF').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function setup(){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss,SHEETS.BASE,BASE_HEADERS); ensureSheet_(ss,SHEETS.SURVEYS,SURVEY_HEADERS);
  return {ok:true,spreadsheetUrl:ss.getUrl()};
}
function loadApp(pin){
  assertPin_(pin);
  var assets=readObjects_(SHEETS.BASE).filter(function(r){return String(r.status||'').toUpperCase().indexOf('PDV')!==-1;});
  return {ok:true,assets:assets,report:buildReport_(assets,readObjects_(SHEETS.SURVEYS))};
}
function getReport(pin){
  assertPin_(pin);
  var assets=readObjects_(SHEETS.BASE).filter(function(r){return String(r.status||'').toUpperCase().indexOf('PDV')!==-1;});
  return {ok:true,report:buildReport_(assets,readObjects_(SHEETS.SURVEYS))};
}
function saveSurvey(pin,payload){
  assertPin_(pin);
  if(!payload||!payload.clientCode) throw new Error('Falta el codigo de cliente.');
  var checks=Array.isArray(payload.checks)?payload.checks:[];
  if(!checks.length) throw new Error('No hay EDF para guardar.');
  var ss=SpreadsheetApp.getActiveSpreadsheet(), sh=ensureSheet_(ss,SHEETS.SURVEYS,SURVEY_HEADERS);
  var createdAt=new Date().toISOString(), id=Utilities.getUuid();
  var values=checks.map(function(c){return [id,createdAt,clean_(payload.user),normalizeCode_(payload.clientCode),clean_(payload.clientName),clean_(payload.location),clean_(c.systemNumber),clean_(c.foundNumber),clean_(c.status||'pending'),clean_(c.comment),clean_(payload.note)];});
  sh.getRange(sh.getLastRow()+1,1,values.length,SURVEY_HEADERS.length).setValues(values);
  return {ok:true,id:id,createdAt:createdAt};
}
function importBase(pin,rows){
  assertPin_(pin);
  if(!Array.isArray(rows)||!rows.length) throw new Error('No llegaron filas para importar.');
  var ss=SpreadsheetApp.getActiveSpreadsheet(), sh=ensureSheet_(ss,SHEETS.BASE,BASE_HEADERS);
  sh.clearContents(); sh.getRange(1,1,1,BASE_HEADERS.length).setValues([BASE_HEADERS]);
  var values=rows.map(function(r){return BASE_HEADERS.map(function(h){return clean_(r[h]);});});
  sh.getRange(2,1,values.length,BASE_HEADERS.length).setValues(values);
  return {ok:true,imported:values.length};
}
function ensureSheet_(ss,name,headers){
  var sh=ss.getSheetByName(name); if(!sh) sh=ss.insertSheet(name);
  var cur=sh.getRange(1,1,1,headers.length).getValues()[0];
  var bad=headers.some(function(h,i){return cur[i]!==h;});
  if(bad) sh.getRange(1,1,1,headers.length).setValues([headers]);
  sh.setFrozenRows(1); return sh;
}
function readObjects_(name){
  var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if(!sh||sh.getLastRow()<2) return [];
  var vals=sh.getDataRange().getValues(), headers=vals.shift().map(String);
  return vals.filter(function(r){return r.some(function(c){return String(c||'').trim();});}).map(function(r){
    var o={}; headers.forEach(function(h,i){o[h]=r[i];}); if(o.clientCode) o.clientCode=normalizeCode_(o.clientCode); return o;
  });
}
function buildReport_(assets,rows){
  var byClient=groupBy_(assets,function(r){return normalizeCode_(r.clientCode);});
  var bySurvey=groupBy_(rows,function(r){return String(r.id||'');});
  var surveys=Object.keys(bySurvey).filter(Boolean).map(function(id){
    var items=bySurvey[id], f=items[0]||{};
    return {id:id,createdAt:f.createdAt,user:f.user,clientCode:normalizeCode_(f.clientCode),clientName:f.clientName,location:f.location,note:f.note,checks:items.map(function(x){return {systemNumber:clean_(x.systemNumber),foundNumber:clean_(x.foundNumber),status:clean_(x.status),comment:clean_(x.comment)};})};
  }).sort(function(a,b){return String(b.createdAt).localeCompare(String(a.createdAt));});
  var latest={}; surveys.forEach(function(s){if(!latest[s.clientCode]) latest[s.clientCode]=s;});
  var clients=Object.keys(byClient).sort(function(a,b){return Number(a)-Number(b);}), out=[];
  clients.forEach(function(code){var s=latest[code], expected=byClient[code]||[]; expected.forEach(function(asset){
    var m=s&&s.checks.find(function(c){return normalizeSerial_(c.systemNumber)===normalizeSerial_(asset.assetNumber);});
    out.push({clientCode:code,clientName:asset.clientName||'',model:asset.model||'',systemNumber:asset.assetNumber||'',foundNumber:m?m.foundNumber:'',status:m?m.status:'sin_relevar',comment:m?m.comment:'',lastSurveyAt:s?s.createdAt:'',user:s?s.user:''});
  });});
  surveys.forEach(function(s){s.checks.forEach(function(c){if(c.systemNumber)return; out.push({clientCode:s.clientCode,clientName:s.clientName||'',model:'EDF adicional',systemNumber:'',foundNumber:c.foundNumber,status:c.status||'extra',comment:c.comment,lastSurveyAt:s.createdAt,user:s.user});});});
  return {totalAssets:assets.length,totalClients:clients.length,surveyedClients:Object.keys(latest).length,ok:out.filter(function(r){return r.status==='ok';}).length,noOk:out.filter(function(r){return r.status==='no_ok'||r.status==='extra';}).length,pending:out.filter(function(r){return r.status==='sin_relevar'||r.status==='pending';}).length,surveys:surveys,rows:out};
}
function groupBy_(items,getKey){return items.reduce(function(a,x){var k=getKey(x); if(!a[k]) a[k]=[]; a[k].push(x); return a;},{});}
function assertPin_(pin){if(String(pin||'').trim()!==APP_PIN) throw new Error('PIN incorrecto.');}
function normalizeCode_(v){return String(v||'').trim().replace(/^0+/,'')||String(v||'').trim();}
function normalizeSerial_(v){return String(v||'').trim().toUpperCase().replace(/\s+/g,'');}
function clean_(v){return String(v==null?'':v).trim();}
