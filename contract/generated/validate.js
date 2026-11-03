"use strict";
export const contentRequest = validate10;
const schema11 = {"$schema":"http://json-schema.org/draft-07/schema#","definitions":{"Notes":{"additionalProperties":false,"properties":{"text":{"type":"string"},"title":{"type":"string"}},"required":["title","text"],"type":"object"},"Version":{"enum":["1"],"type":"string"}},"oneOf":[{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"content.describe","type":"string"},"requestId":{"type":"string"},"version":{"$ref":"#/definitions/Version"}},"required":["operation","version","requestId","contentId"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"content.inspect","type":"string"},"requestId":{"type":"string"},"version":{"$ref":"#/definitions/Version"}},"required":["operation","version","requestId","contentId"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"data":{"$ref":"#/definitions/Notes"},"expectedRevision":{"type":"string"},"operation":{"const":"content.update","type":"string"},"requestId":{"type":"string"},"version":{"$ref":"#/definitions/Version"}},"required":["operation","version","requestId","contentId","expectedRevision","data"],"type":"object"}],"title":"Request"};
const schema12 = {"enum":["1"],"type":"string"};
const schema14 = {"additionalProperties":false,"properties":{"text":{"type":"string"},"title":{"type":"string"}},"required":["title","text"],"type":"object"};

function validate10(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(errors === _errs1){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((((data.operation === undefined) && (missing0 = "operation")) || ((data.version === undefined) && (missing0 = "version"))) || ((data.requestId === undefined) && (missing0 = "requestId"))) || ((data.contentId === undefined) && (missing0 = "contentId"))){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
else {
const _errs3 = errors;
for(const key0 in data){
if(!((((key0 === "contentId") || (key0 === "operation")) || (key0 === "requestId")) || (key0 === "version"))){
const err1 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
break;
}
}
if(_errs3 === errors){
if(data.contentId !== undefined){
const _errs4 = errors;
if(typeof data.contentId !== "string"){
const err2 = {instancePath:instancePath+"/contentId",schemaPath:"#/oneOf/0/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
var valid1 = _errs4 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.operation !== undefined){
let data1 = data.operation;
const _errs6 = errors;
if(typeof data1 !== "string"){
const err3 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/0/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if("content.describe" !== data1){
const err4 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/0/properties/operation/const",keyword:"const",params:{allowedValue: "content.describe"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
var valid1 = _errs6 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.requestId !== undefined){
const _errs8 = errors;
if(typeof data.requestId !== "string"){
const err5 = {instancePath:instancePath+"/requestId",schemaPath:"#/oneOf/0/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
var valid1 = _errs8 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.version !== undefined){
let data3 = data.version;
const _errs10 = errors;
if(typeof data3 !== "string"){
const err6 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(!(data3 === "1")){
const err7 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/enum",keyword:"enum",params:{allowedValues: schema12.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
var valid1 = _errs10 === errors;
}
else {
var valid1 = true;
}
}
}
}
}
}
}
else {
const err8 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
}
const _errs13 = errors;
if(errors === _errs13){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing1;
if(((((data.operation === undefined) && (missing1 = "operation")) || ((data.version === undefined) && (missing1 = "version"))) || ((data.requestId === undefined) && (missing1 = "requestId"))) || ((data.contentId === undefined) && (missing1 = "contentId"))){
const err9 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
else {
const _errs15 = errors;
for(const key1 in data){
if(!((((key1 === "contentId") || (key1 === "operation")) || (key1 === "requestId")) || (key1 === "version"))){
const err10 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
break;
}
}
if(_errs15 === errors){
if(data.contentId !== undefined){
const _errs16 = errors;
if(typeof data.contentId !== "string"){
const err11 = {instancePath:instancePath+"/contentId",schemaPath:"#/oneOf/1/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
var valid3 = _errs16 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data.operation !== undefined){
let data5 = data.operation;
const _errs18 = errors;
if(typeof data5 !== "string"){
const err12 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/1/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if("content.inspect" !== data5){
const err13 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/1/properties/operation/const",keyword:"const",params:{allowedValue: "content.inspect"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
var valid3 = _errs18 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data.requestId !== undefined){
const _errs20 = errors;
if(typeof data.requestId !== "string"){
const err14 = {instancePath:instancePath+"/requestId",schemaPath:"#/oneOf/1/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
var valid3 = _errs20 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data.version !== undefined){
let data7 = data.version;
const _errs22 = errors;
if(typeof data7 !== "string"){
const err15 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(!(data7 === "1")){
const err16 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/enum",keyword:"enum",params:{allowedValues: schema12.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
var valid3 = _errs22 === errors;
}
else {
var valid3 = true;
}
}
}
}
}
}
}
else {
const err17 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
var _valid0 = _errs13 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
}
const _errs25 = errors;
if(errors === _errs25){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing2;
if(((((((data.operation === undefined) && (missing2 = "operation")) || ((data.version === undefined) && (missing2 = "version"))) || ((data.requestId === undefined) && (missing2 = "requestId"))) || ((data.contentId === undefined) && (missing2 = "contentId"))) || ((data.expectedRevision === undefined) && (missing2 = "expectedRevision"))) || ((data.data === undefined) && (missing2 = "data"))){
const err18 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
else {
const _errs27 = errors;
for(const key2 in data){
if(!((((((key2 === "contentId") || (key2 === "data")) || (key2 === "expectedRevision")) || (key2 === "operation")) || (key2 === "requestId")) || (key2 === "version"))){
const err19 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
break;
}
}
if(_errs27 === errors){
if(data.contentId !== undefined){
const _errs28 = errors;
if(typeof data.contentId !== "string"){
const err20 = {instancePath:instancePath+"/contentId",schemaPath:"#/oneOf/2/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
var valid5 = _errs28 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data.data !== undefined){
let data9 = data.data;
const _errs30 = errors;
const _errs31 = errors;
if(errors === _errs31){
if(data9 && typeof data9 == "object" && !Array.isArray(data9)){
let missing3;
if(((data9.title === undefined) && (missing3 = "title")) || ((data9.text === undefined) && (missing3 = "text"))){
const err21 = {instancePath:instancePath+"/data",schemaPath:"#/definitions/Notes/required",keyword:"required",params:{missingProperty: missing3},message:"must have required property '"+missing3+"'"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
else {
const _errs33 = errors;
for(const key3 in data9){
if(!((key3 === "text") || (key3 === "title"))){
const err22 = {instancePath:instancePath+"/data",schemaPath:"#/definitions/Notes/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
break;
}
}
if(_errs33 === errors){
if(data9.text !== undefined){
const _errs34 = errors;
if(typeof data9.text !== "string"){
const err23 = {instancePath:instancePath+"/data/text",schemaPath:"#/definitions/Notes/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
var valid7 = _errs34 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data9.title !== undefined){
const _errs36 = errors;
if(typeof data9.title !== "string"){
const err24 = {instancePath:instancePath+"/data/title",schemaPath:"#/definitions/Notes/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
var valid7 = _errs36 === errors;
}
else {
var valid7 = true;
}
}
}
}
}
else {
const err25 = {instancePath:instancePath+"/data",schemaPath:"#/definitions/Notes/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
var valid5 = _errs30 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data.expectedRevision !== undefined){
const _errs38 = errors;
if(typeof data.expectedRevision !== "string"){
const err26 = {instancePath:instancePath+"/expectedRevision",schemaPath:"#/oneOf/2/properties/expectedRevision/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
var valid5 = _errs38 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data.operation !== undefined){
let data13 = data.operation;
const _errs40 = errors;
if(typeof data13 !== "string"){
const err27 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/2/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
if("content.update" !== data13){
const err28 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/2/properties/operation/const",keyword:"const",params:{allowedValue: "content.update"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
var valid5 = _errs40 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data.requestId !== undefined){
const _errs42 = errors;
if(typeof data.requestId !== "string"){
const err29 = {instancePath:instancePath+"/requestId",schemaPath:"#/oneOf/2/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
var valid5 = _errs42 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data.version !== undefined){
let data15 = data.version;
const _errs44 = errors;
if(typeof data15 !== "string"){
const err30 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
if(!(data15 === "1")){
const err31 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/enum",keyword:"enum",params:{allowedValues: schema12.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
var valid5 = _errs44 === errors;
}
else {
var valid5 = true;
}
}
}
}
}
}
}
}
}
else {
const err32 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
var _valid0 = _errs25 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
}
}
}
if(!valid0){
const err33 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
validate10.errors = vErrors;
return false;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate10.errors = vErrors;
return errors === 0;
}

export const contentResponse = validate11;
const schema16 = {"$schema":"http://json-schema.org/draft-07/schema#","definitions":{"Notes":{"additionalProperties":false,"properties":{"text":{"type":"string"},"title":{"type":"string"}},"required":["title","text"],"type":"object"},"Snapshot":{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"data":{"$ref":"#/definitions/Notes"},"revision":{"type":"string"},"warning":{"type":["string","null"]}},"required":["contentId","revision","data"],"type":"object"},"Version":{"enum":["1"],"type":"string"}},"oneOf":[{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"message":{"type":"string"},"requestId":{"type":"string"},"revision":{"type":["string","null"]},"status":{"const":"limited","type":"string"},"version":{"$ref":"#/definitions/Version"},"warningPresent":{"type":"boolean"}},"required":["status","version","requestId","contentId","warningPresent","message"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"requestId":{"type":"string"},"schemaDeclared":{"type":"boolean"},"stateSchema":true,"status":{"const":"described","type":"string"},"version":{"$ref":"#/definitions/Version"}},"required":["status","version","requestId","contentId","schemaDeclared"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"requestId":{"type":"string"},"snapshot":{"$ref":"#/definitions/Snapshot"},"status":{"const":"snapshot","type":"string"},"version":{"$ref":"#/definitions/Version"}},"required":["status","version","requestId","contentId","snapshot"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"requestId":{"type":"string"},"snapshot":{"$ref":"#/definitions/Snapshot"},"status":{"const":"applied","type":"string"},"version":{"$ref":"#/definitions/Version"}},"required":["status","version","requestId","contentId","snapshot"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"expectedRevision":{"type":["string","null"]},"message":{"type":"string"},"requestId":{"type":"string"},"status":{"const":"rejected","type":"string"},"version":{"$ref":"#/definitions/Version"}},"required":["status","version","requestId","contentId","message"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"expectedRevision":{"type":"string"},"message":{"type":"string"},"requestId":{"type":"string"},"status":{"const":"uncertain","type":"string"},"version":{"$ref":"#/definitions/Version"}},"required":["status","version","requestId","contentId","expectedRevision","message"],"type":"object"}],"title":"Response"};
const schema17 = {"enum":["1"],"type":"string"};
const schema19 = {"additionalProperties":false,"properties":{"contentId":{"type":"string"},"data":{"$ref":"#/definitions/Notes"},"revision":{"type":"string"},"warning":{"type":["string","null"]}},"required":["contentId","revision","data"],"type":"object"};
const schema20 = {"additionalProperties":false,"properties":{"text":{"type":"string"},"title":{"type":"string"}},"required":["title","text"],"type":"object"};

function validate12(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((((data.contentId === undefined) && (missing0 = "contentId")) || ((data.revision === undefined) && (missing0 = "revision"))) || ((data.data === undefined) && (missing0 = "data"))){
validate12.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((((key0 === "contentId") || (key0 === "data")) || (key0 === "revision")) || (key0 === "warning"))){
validate12.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.contentId !== undefined){
const _errs2 = errors;
if(typeof data.contentId !== "string"){
validate12.errors = [{instancePath:instancePath+"/contentId",schemaPath:"#/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.data !== undefined){
let data1 = data.data;
const _errs4 = errors;
const _errs5 = errors;
if(errors === _errs5){
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
let missing1;
if(((data1.title === undefined) && (missing1 = "title")) || ((data1.text === undefined) && (missing1 = "text"))){
validate12.errors = [{instancePath:instancePath+"/data",schemaPath:"#/definitions/Notes/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"}];
return false;
}
else {
const _errs7 = errors;
for(const key1 in data1){
if(!((key1 === "text") || (key1 === "title"))){
validate12.errors = [{instancePath:instancePath+"/data",schemaPath:"#/definitions/Notes/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs7 === errors){
if(data1.text !== undefined){
const _errs8 = errors;
if(typeof data1.text !== "string"){
validate12.errors = [{instancePath:instancePath+"/data/text",schemaPath:"#/definitions/Notes/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid2 = _errs8 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data1.title !== undefined){
const _errs10 = errors;
if(typeof data1.title !== "string"){
validate12.errors = [{instancePath:instancePath+"/data/title",schemaPath:"#/definitions/Notes/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid2 = _errs10 === errors;
}
else {
var valid2 = true;
}
}
}
}
}
else {
validate12.errors = [{instancePath:instancePath+"/data",schemaPath:"#/definitions/Notes/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
var valid0 = _errs4 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.revision !== undefined){
const _errs12 = errors;
if(typeof data.revision !== "string"){
validate12.errors = [{instancePath:instancePath+"/revision",schemaPath:"#/properties/revision/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs12 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.warning !== undefined){
let data5 = data.warning;
const _errs14 = errors;
if((typeof data5 !== "string") && (data5 !== null)){
validate12.errors = [{instancePath:instancePath+"/warning",schemaPath:"#/properties/warning/type",keyword:"type",params:{type: schema19.properties.warning.type},message:"must be string,null"}];
return false;
}
var valid0 = _errs14 === errors;
}
else {
var valid0 = true;
}
}
}
}
}
}
}
else {
validate12.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate12.errors = vErrors;
return errors === 0;
}


function validate11(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(errors === _errs1){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((((((data.status === undefined) && (missing0 = "status")) || ((data.version === undefined) && (missing0 = "version"))) || ((data.requestId === undefined) && (missing0 = "requestId"))) || ((data.contentId === undefined) && (missing0 = "contentId"))) || ((data.warningPresent === undefined) && (missing0 = "warningPresent"))) || ((data.message === undefined) && (missing0 = "message"))){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
else {
const _errs3 = errors;
for(const key0 in data){
if(!(((((((key0 === "contentId") || (key0 === "message")) || (key0 === "requestId")) || (key0 === "revision")) || (key0 === "status")) || (key0 === "version")) || (key0 === "warningPresent"))){
const err1 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
break;
}
}
if(_errs3 === errors){
if(data.contentId !== undefined){
const _errs4 = errors;
if(typeof data.contentId !== "string"){
const err2 = {instancePath:instancePath+"/contentId",schemaPath:"#/oneOf/0/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
var valid1 = _errs4 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.message !== undefined){
const _errs6 = errors;
if(typeof data.message !== "string"){
const err3 = {instancePath:instancePath+"/message",schemaPath:"#/oneOf/0/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
var valid1 = _errs6 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.requestId !== undefined){
const _errs8 = errors;
if(typeof data.requestId !== "string"){
const err4 = {instancePath:instancePath+"/requestId",schemaPath:"#/oneOf/0/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
var valid1 = _errs8 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.revision !== undefined){
let data3 = data.revision;
const _errs10 = errors;
if((typeof data3 !== "string") && (data3 !== null)){
const err5 = {instancePath:instancePath+"/revision",schemaPath:"#/oneOf/0/properties/revision/type",keyword:"type",params:{type: schema16.oneOf[0].properties.revision.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
var valid1 = _errs10 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.status !== undefined){
let data4 = data.status;
const _errs12 = errors;
if(typeof data4 !== "string"){
const err6 = {instancePath:instancePath+"/status",schemaPath:"#/oneOf/0/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if("limited" !== data4){
const err7 = {instancePath:instancePath+"/status",schemaPath:"#/oneOf/0/properties/status/const",keyword:"const",params:{allowedValue: "limited"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
var valid1 = _errs12 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.version !== undefined){
let data5 = data.version;
const _errs14 = errors;
if(typeof data5 !== "string"){
const err8 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(!(data5 === "1")){
const err9 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/enum",keyword:"enum",params:{allowedValues: schema17.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
var valid1 = _errs14 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.warningPresent !== undefined){
const _errs17 = errors;
if(typeof data.warningPresent !== "boolean"){
const err10 = {instancePath:instancePath+"/warningPresent",schemaPath:"#/oneOf/0/properties/warningPresent/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
var valid1 = _errs17 === errors;
}
else {
var valid1 = true;
}
}
}
}
}
}
}
}
}
}
else {
const err11 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
}
const _errs19 = errors;
if(errors === _errs19){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing1;
if((((((data.status === undefined) && (missing1 = "status")) || ((data.version === undefined) && (missing1 = "version"))) || ((data.requestId === undefined) && (missing1 = "requestId"))) || ((data.contentId === undefined) && (missing1 = "contentId"))) || ((data.schemaDeclared === undefined) && (missing1 = "schemaDeclared"))){
const err12 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
else {
const _errs21 = errors;
for(const key1 in data){
if(!((((((key1 === "contentId") || (key1 === "requestId")) || (key1 === "schemaDeclared")) || (key1 === "stateSchema")) || (key1 === "status")) || (key1 === "version"))){
const err13 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
break;
}
}
if(_errs21 === errors){
if(data.contentId !== undefined){
const _errs22 = errors;
if(typeof data.contentId !== "string"){
const err14 = {instancePath:instancePath+"/contentId",schemaPath:"#/oneOf/1/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
var valid3 = _errs22 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data.requestId !== undefined){
const _errs24 = errors;
if(typeof data.requestId !== "string"){
const err15 = {instancePath:instancePath+"/requestId",schemaPath:"#/oneOf/1/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
var valid3 = _errs24 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data.schemaDeclared !== undefined){
const _errs26 = errors;
if(typeof data.schemaDeclared !== "boolean"){
const err16 = {instancePath:instancePath+"/schemaDeclared",schemaPath:"#/oneOf/1/properties/schemaDeclared/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
var valid3 = _errs26 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data.status !== undefined){
let data10 = data.status;
const _errs28 = errors;
if(typeof data10 !== "string"){
const err17 = {instancePath:instancePath+"/status",schemaPath:"#/oneOf/1/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if("described" !== data10){
const err18 = {instancePath:instancePath+"/status",schemaPath:"#/oneOf/1/properties/status/const",keyword:"const",params:{allowedValue: "described"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
var valid3 = _errs28 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data.version !== undefined){
let data11 = data.version;
const _errs30 = errors;
if(typeof data11 !== "string"){
const err19 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(!(data11 === "1")){
const err20 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/enum",keyword:"enum",params:{allowedValues: schema17.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
var valid3 = _errs30 === errors;
}
else {
var valid3 = true;
}
}
}
}
}
}
}
}
else {
const err21 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
var _valid0 = _errs19 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
}
const _errs33 = errors;
if(errors === _errs33){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing2;
if((((((data.status === undefined) && (missing2 = "status")) || ((data.version === undefined) && (missing2 = "version"))) || ((data.requestId === undefined) && (missing2 = "requestId"))) || ((data.contentId === undefined) && (missing2 = "contentId"))) || ((data.snapshot === undefined) && (missing2 = "snapshot"))){
const err22 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
else {
const _errs35 = errors;
for(const key2 in data){
if(!(((((key2 === "contentId") || (key2 === "requestId")) || (key2 === "snapshot")) || (key2 === "status")) || (key2 === "version"))){
const err23 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
break;
}
}
if(_errs35 === errors){
if(data.contentId !== undefined){
const _errs36 = errors;
if(typeof data.contentId !== "string"){
const err24 = {instancePath:instancePath+"/contentId",schemaPath:"#/oneOf/2/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
var valid5 = _errs36 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data.requestId !== undefined){
const _errs38 = errors;
if(typeof data.requestId !== "string"){
const err25 = {instancePath:instancePath+"/requestId",schemaPath:"#/oneOf/2/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
var valid5 = _errs38 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data.snapshot !== undefined){
const _errs40 = errors;
if(!(validate12(data.snapshot, {instancePath:instancePath+"/snapshot",parentData:data,parentDataProperty:"snapshot",rootData}))){
vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
errors = vErrors.length;
}
var valid5 = _errs40 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data.status !== undefined){
let data15 = data.status;
const _errs41 = errors;
if(typeof data15 !== "string"){
const err26 = {instancePath:instancePath+"/status",schemaPath:"#/oneOf/2/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if("snapshot" !== data15){
const err27 = {instancePath:instancePath+"/status",schemaPath:"#/oneOf/2/properties/status/const",keyword:"const",params:{allowedValue: "snapshot"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
var valid5 = _errs41 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data.version !== undefined){
let data16 = data.version;
const _errs43 = errors;
if(typeof data16 !== "string"){
const err28 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if(!(data16 === "1")){
const err29 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/enum",keyword:"enum",params:{allowedValues: schema17.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
var valid5 = _errs43 === errors;
}
else {
var valid5 = true;
}
}
}
}
}
}
}
}
else {
const err30 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
var _valid0 = _errs33 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
}
const _errs46 = errors;
if(errors === _errs46){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing3;
if((((((data.status === undefined) && (missing3 = "status")) || ((data.version === undefined) && (missing3 = "version"))) || ((data.requestId === undefined) && (missing3 = "requestId"))) || ((data.contentId === undefined) && (missing3 = "contentId"))) || ((data.snapshot === undefined) && (missing3 = "snapshot"))){
const err31 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: missing3},message:"must have required property '"+missing3+"'"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
else {
const _errs48 = errors;
for(const key3 in data){
if(!(((((key3 === "contentId") || (key3 === "requestId")) || (key3 === "snapshot")) || (key3 === "status")) || (key3 === "version"))){
const err32 = {instancePath,schemaPath:"#/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
break;
}
}
if(_errs48 === errors){
if(data.contentId !== undefined){
const _errs49 = errors;
if(typeof data.contentId !== "string"){
const err33 = {instancePath:instancePath+"/contentId",schemaPath:"#/oneOf/3/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
var valid7 = _errs49 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data.requestId !== undefined){
const _errs51 = errors;
if(typeof data.requestId !== "string"){
const err34 = {instancePath:instancePath+"/requestId",schemaPath:"#/oneOf/3/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
var valid7 = _errs51 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data.snapshot !== undefined){
const _errs53 = errors;
if(!(validate12(data.snapshot, {instancePath:instancePath+"/snapshot",parentData:data,parentDataProperty:"snapshot",rootData}))){
vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
errors = vErrors.length;
}
var valid7 = _errs53 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data.status !== undefined){
let data20 = data.status;
const _errs54 = errors;
if(typeof data20 !== "string"){
const err35 = {instancePath:instancePath+"/status",schemaPath:"#/oneOf/3/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
if("applied" !== data20){
const err36 = {instancePath:instancePath+"/status",schemaPath:"#/oneOf/3/properties/status/const",keyword:"const",params:{allowedValue: "applied"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
var valid7 = _errs54 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data.version !== undefined){
let data21 = data.version;
const _errs56 = errors;
if(typeof data21 !== "string"){
const err37 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
if(!(data21 === "1")){
const err38 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/enum",keyword:"enum",params:{allowedValues: schema17.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
var valid7 = _errs56 === errors;
}
else {
var valid7 = true;
}
}
}
}
}
}
}
}
else {
const err39 = {instancePath,schemaPath:"#/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
var _valid0 = _errs46 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid0 = true;
passing0 = 3;
}
const _errs59 = errors;
if(errors === _errs59){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing4;
if((((((data.status === undefined) && (missing4 = "status")) || ((data.version === undefined) && (missing4 = "version"))) || ((data.requestId === undefined) && (missing4 = "requestId"))) || ((data.contentId === undefined) && (missing4 = "contentId"))) || ((data.message === undefined) && (missing4 = "message"))){
const err40 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: missing4},message:"must have required property '"+missing4+"'"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
else {
const _errs61 = errors;
for(const key4 in data){
if(!((((((key4 === "contentId") || (key4 === "expectedRevision")) || (key4 === "message")) || (key4 === "requestId")) || (key4 === "status")) || (key4 === "version"))){
const err41 = {instancePath,schemaPath:"#/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
break;
}
}
if(_errs61 === errors){
if(data.contentId !== undefined){
const _errs62 = errors;
if(typeof data.contentId !== "string"){
const err42 = {instancePath:instancePath+"/contentId",schemaPath:"#/oneOf/4/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
var valid9 = _errs62 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data.expectedRevision !== undefined){
let data23 = data.expectedRevision;
const _errs64 = errors;
if((typeof data23 !== "string") && (data23 !== null)){
const err43 = {instancePath:instancePath+"/expectedRevision",schemaPath:"#/oneOf/4/properties/expectedRevision/type",keyword:"type",params:{type: schema16.oneOf[4].properties.expectedRevision.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
var valid9 = _errs64 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data.message !== undefined){
const _errs66 = errors;
if(typeof data.message !== "string"){
const err44 = {instancePath:instancePath+"/message",schemaPath:"#/oneOf/4/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
var valid9 = _errs66 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data.requestId !== undefined){
const _errs68 = errors;
if(typeof data.requestId !== "string"){
const err45 = {instancePath:instancePath+"/requestId",schemaPath:"#/oneOf/4/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
var valid9 = _errs68 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data.status !== undefined){
let data26 = data.status;
const _errs70 = errors;
if(typeof data26 !== "string"){
const err46 = {instancePath:instancePath+"/status",schemaPath:"#/oneOf/4/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
if("rejected" !== data26){
const err47 = {instancePath:instancePath+"/status",schemaPath:"#/oneOf/4/properties/status/const",keyword:"const",params:{allowedValue: "rejected"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
var valid9 = _errs70 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data.version !== undefined){
let data27 = data.version;
const _errs72 = errors;
if(typeof data27 !== "string"){
const err48 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
if(!(data27 === "1")){
const err49 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/enum",keyword:"enum",params:{allowedValues: schema17.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
var valid9 = _errs72 === errors;
}
else {
var valid9 = true;
}
}
}
}
}
}
}
}
}
else {
const err50 = {instancePath,schemaPath:"#/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
var _valid0 = _errs59 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 4];
}
else {
if(_valid0){
valid0 = true;
passing0 = 4;
}
const _errs75 = errors;
if(errors === _errs75){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing5;
if(((((((data.status === undefined) && (missing5 = "status")) || ((data.version === undefined) && (missing5 = "version"))) || ((data.requestId === undefined) && (missing5 = "requestId"))) || ((data.contentId === undefined) && (missing5 = "contentId"))) || ((data.expectedRevision === undefined) && (missing5 = "expectedRevision"))) || ((data.message === undefined) && (missing5 = "message"))){
const err51 = {instancePath,schemaPath:"#/oneOf/5/required",keyword:"required",params:{missingProperty: missing5},message:"must have required property '"+missing5+"'"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
else {
const _errs77 = errors;
for(const key5 in data){
if(!((((((key5 === "contentId") || (key5 === "expectedRevision")) || (key5 === "message")) || (key5 === "requestId")) || (key5 === "status")) || (key5 === "version"))){
const err52 = {instancePath,schemaPath:"#/oneOf/5/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
break;
}
}
if(_errs77 === errors){
if(data.contentId !== undefined){
const _errs78 = errors;
if(typeof data.contentId !== "string"){
const err53 = {instancePath:instancePath+"/contentId",schemaPath:"#/oneOf/5/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
var valid11 = _errs78 === errors;
}
else {
var valid11 = true;
}
if(valid11){
if(data.expectedRevision !== undefined){
const _errs80 = errors;
if(typeof data.expectedRevision !== "string"){
const err54 = {instancePath:instancePath+"/expectedRevision",schemaPath:"#/oneOf/5/properties/expectedRevision/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
var valid11 = _errs80 === errors;
}
else {
var valid11 = true;
}
if(valid11){
if(data.message !== undefined){
const _errs82 = errors;
if(typeof data.message !== "string"){
const err55 = {instancePath:instancePath+"/message",schemaPath:"#/oneOf/5/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
var valid11 = _errs82 === errors;
}
else {
var valid11 = true;
}
if(valid11){
if(data.requestId !== undefined){
const _errs84 = errors;
if(typeof data.requestId !== "string"){
const err56 = {instancePath:instancePath+"/requestId",schemaPath:"#/oneOf/5/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
var valid11 = _errs84 === errors;
}
else {
var valid11 = true;
}
if(valid11){
if(data.status !== undefined){
let data32 = data.status;
const _errs86 = errors;
if(typeof data32 !== "string"){
const err57 = {instancePath:instancePath+"/status",schemaPath:"#/oneOf/5/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
if("uncertain" !== data32){
const err58 = {instancePath:instancePath+"/status",schemaPath:"#/oneOf/5/properties/status/const",keyword:"const",params:{allowedValue: "uncertain"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
var valid11 = _errs86 === errors;
}
else {
var valid11 = true;
}
if(valid11){
if(data.version !== undefined){
let data33 = data.version;
const _errs88 = errors;
if(typeof data33 !== "string"){
const err59 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
if(!(data33 === "1")){
const err60 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/enum",keyword:"enum",params:{allowedValues: schema17.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
var valid11 = _errs88 === errors;
}
else {
var valid11 = true;
}
}
}
}
}
}
}
}
}
else {
const err61 = {instancePath,schemaPath:"#/oneOf/5/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
}
var _valid0 = _errs75 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 5];
}
else {
if(_valid0){
valid0 = true;
passing0 = 5;
}
}
}
}
}
}
if(!valid0){
const err62 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
validate11.errors = vErrors;
return false;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate11.errors = vErrors;
return errors === 0;
}

export const contentTool = validate15;
const schema25 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"definitions":{"Action":{"oneOf":[{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"describe","type":"string"}},"required":["operation","contentId"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"inspect","type":"string"}},"required":["operation","contentId"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"data":{"$ref":"#/definitions/Notes"},"expectedRevision":{"type":"string"},"operation":{"const":"update","type":"string"}},"required":["operation","contentId","expectedRevision","data"],"type":"object"}]},"Notes":{"additionalProperties":false,"properties":{"text":{"type":"string"},"title":{"type":"string"}},"required":["title","text"],"type":"object"}},"properties":{"action":{"$ref":"#/definitions/Action"},"expectedVersion":{"type":"string"}},"required":["expectedVersion","action"],"title":"Input","type":"object"};
const schema26 = {"oneOf":[{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"describe","type":"string"}},"required":["operation","contentId"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"inspect","type":"string"}},"required":["operation","contentId"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"data":{"$ref":"#/definitions/Notes"},"expectedRevision":{"type":"string"},"operation":{"const":"update","type":"string"}},"required":["operation","contentId","expectedRevision","data"],"type":"object"}]};
const schema27 = {"additionalProperties":false,"properties":{"text":{"type":"string"},"title":{"type":"string"}},"required":["title","text"],"type":"object"};

function validate16(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(errors === _errs1){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((data.operation === undefined) && (missing0 = "operation")) || ((data.contentId === undefined) && (missing0 = "contentId"))){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
else {
const _errs3 = errors;
for(const key0 in data){
if(!((key0 === "contentId") || (key0 === "operation"))){
const err1 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
break;
}
}
if(_errs3 === errors){
if(data.contentId !== undefined){
const _errs4 = errors;
if(typeof data.contentId !== "string"){
const err2 = {instancePath:instancePath+"/contentId",schemaPath:"#/oneOf/0/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
var valid1 = _errs4 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.operation !== undefined){
let data1 = data.operation;
const _errs6 = errors;
if(typeof data1 !== "string"){
const err3 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/0/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if("describe" !== data1){
const err4 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/0/properties/operation/const",keyword:"const",params:{allowedValue: "describe"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
var valid1 = _errs6 === errors;
}
else {
var valid1 = true;
}
}
}
}
}
else {
const err5 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
}
const _errs8 = errors;
if(errors === _errs8){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing1;
if(((data.operation === undefined) && (missing1 = "operation")) || ((data.contentId === undefined) && (missing1 = "contentId"))){
const err6 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
else {
const _errs10 = errors;
for(const key1 in data){
if(!((key1 === "contentId") || (key1 === "operation"))){
const err7 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
break;
}
}
if(_errs10 === errors){
if(data.contentId !== undefined){
const _errs11 = errors;
if(typeof data.contentId !== "string"){
const err8 = {instancePath:instancePath+"/contentId",schemaPath:"#/oneOf/1/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
var valid2 = _errs11 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data.operation !== undefined){
let data3 = data.operation;
const _errs13 = errors;
if(typeof data3 !== "string"){
const err9 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/1/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if("inspect" !== data3){
const err10 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/1/properties/operation/const",keyword:"const",params:{allowedValue: "inspect"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
var valid2 = _errs13 === errors;
}
else {
var valid2 = true;
}
}
}
}
}
else {
const err11 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
var _valid0 = _errs8 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
}
const _errs15 = errors;
if(errors === _errs15){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing2;
if(((((data.operation === undefined) && (missing2 = "operation")) || ((data.contentId === undefined) && (missing2 = "contentId"))) || ((data.expectedRevision === undefined) && (missing2 = "expectedRevision"))) || ((data.data === undefined) && (missing2 = "data"))){
const err12 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
else {
const _errs17 = errors;
for(const key2 in data){
if(!((((key2 === "contentId") || (key2 === "data")) || (key2 === "expectedRevision")) || (key2 === "operation"))){
const err13 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
break;
}
}
if(_errs17 === errors){
if(data.contentId !== undefined){
const _errs18 = errors;
if(typeof data.contentId !== "string"){
const err14 = {instancePath:instancePath+"/contentId",schemaPath:"#/oneOf/2/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
var valid3 = _errs18 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data.data !== undefined){
let data5 = data.data;
const _errs20 = errors;
const _errs21 = errors;
if(errors === _errs21){
if(data5 && typeof data5 == "object" && !Array.isArray(data5)){
let missing3;
if(((data5.title === undefined) && (missing3 = "title")) || ((data5.text === undefined) && (missing3 = "text"))){
const err15 = {instancePath:instancePath+"/data",schemaPath:"#/definitions/Notes/required",keyword:"required",params:{missingProperty: missing3},message:"must have required property '"+missing3+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
else {
const _errs23 = errors;
for(const key3 in data5){
if(!((key3 === "text") || (key3 === "title"))){
const err16 = {instancePath:instancePath+"/data",schemaPath:"#/definitions/Notes/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
break;
}
}
if(_errs23 === errors){
if(data5.text !== undefined){
const _errs24 = errors;
if(typeof data5.text !== "string"){
const err17 = {instancePath:instancePath+"/data/text",schemaPath:"#/definitions/Notes/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
var valid5 = _errs24 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data5.title !== undefined){
const _errs26 = errors;
if(typeof data5.title !== "string"){
const err18 = {instancePath:instancePath+"/data/title",schemaPath:"#/definitions/Notes/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
var valid5 = _errs26 === errors;
}
else {
var valid5 = true;
}
}
}
}
}
else {
const err19 = {instancePath:instancePath+"/data",schemaPath:"#/definitions/Notes/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
var valid3 = _errs20 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data.expectedRevision !== undefined){
const _errs28 = errors;
if(typeof data.expectedRevision !== "string"){
const err20 = {instancePath:instancePath+"/expectedRevision",schemaPath:"#/oneOf/2/properties/expectedRevision/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
var valid3 = _errs28 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data.operation !== undefined){
let data9 = data.operation;
const _errs30 = errors;
if(typeof data9 !== "string"){
const err21 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/2/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if("update" !== data9){
const err22 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/2/properties/operation/const",keyword:"const",params:{allowedValue: "update"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
var valid3 = _errs30 === errors;
}
else {
var valid3 = true;
}
}
}
}
}
}
}
else {
const err23 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
var _valid0 = _errs15 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
}
}
}
if(!valid0){
const err24 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
validate16.errors = vErrors;
return false;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate16.errors = vErrors;
return errors === 0;
}


function validate15(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((data.expectedVersion === undefined) && (missing0 = "expectedVersion")) || ((data.action === undefined) && (missing0 = "action"))){
validate15.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((key0 === "action") || (key0 === "expectedVersion"))){
validate15.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.action !== undefined){
const _errs2 = errors;
if(!(validate16(data.action, {instancePath:instancePath+"/action",parentData:data,parentDataProperty:"action",rootData}))){
vErrors = vErrors === null ? validate16.errors : vErrors.concat(validate16.errors);
errors = vErrors.length;
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.expectedVersion !== undefined){
const _errs3 = errors;
if(typeof data.expectedVersion !== "string"){
validate15.errors = [{instancePath:instancePath+"/expectedVersion",schemaPath:"#/properties/expectedVersion/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs3 === errors;
}
else {
var valid0 = true;
}
}
}
}
}
else {
validate15.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate15.errors = vErrors;
return errors === 0;
}

export const conversationReply = validate18;
const schema28 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"definitions":{"Delivery":{"enum":["accepted","rejected","unconfirmed"],"type":"string"}},"properties":{"delivery":{"$ref":"#/definitions/Delivery"},"error":{"type":["string","null"]},"requestId":{"type":"string"}},"required":["requestId","delivery"],"title":"Reply","type":"object"};
const schema29 = {"enum":["accepted","rejected","unconfirmed"],"type":"string"};

function validate18(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((data.requestId === undefined) && (missing0 = "requestId")) || ((data.delivery === undefined) && (missing0 = "delivery"))){
validate18.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(((key0 === "delivery") || (key0 === "error")) || (key0 === "requestId"))){
validate18.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.delivery !== undefined){
let data0 = data.delivery;
const _errs2 = errors;
if(typeof data0 !== "string"){
validate18.errors = [{instancePath:instancePath+"/delivery",schemaPath:"#/definitions/Delivery/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!(((data0 === "accepted") || (data0 === "rejected")) || (data0 === "unconfirmed"))){
validate18.errors = [{instancePath:instancePath+"/delivery",schemaPath:"#/definitions/Delivery/enum",keyword:"enum",params:{allowedValues: schema29.enum},message:"must be equal to one of the allowed values"}];
return false;
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.error !== undefined){
let data1 = data.error;
const _errs5 = errors;
if((typeof data1 !== "string") && (data1 !== null)){
validate18.errors = [{instancePath:instancePath+"/error",schemaPath:"#/properties/error/type",keyword:"type",params:{type: schema28.properties.error.type},message:"must be string,null"}];
return false;
}
var valid0 = _errs5 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.requestId !== undefined){
const _errs7 = errors;
if(typeof data.requestId !== "string"){
validate18.errors = [{instancePath:instancePath+"/requestId",schemaPath:"#/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs7 === errors;
}
else {
var valid0 = true;
}
}
}
}
}
}
else {
validate18.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate18.errors = vErrors;
return errors === 0;
}

export const conversationRequest = validate19;
const schema30 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"definitions":{"Action":{"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"send","type":"string"},"text":{"type":"string"}},"required":["operation","text"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"interrupt","type":"string"}},"required":["operation"],"type":"object"}]}},"properties":{"action":{"$ref":"#/definitions/Action"},"requestId":{"type":"string"}},"required":["requestId","action"],"title":"Request","type":"object"};
const schema31 = {"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"send","type":"string"},"text":{"type":"string"}},"required":["operation","text"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"interrupt","type":"string"}},"required":["operation"],"type":"object"}]};

function validate19(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((data.requestId === undefined) && (missing0 = "requestId")) || ((data.action === undefined) && (missing0 = "action"))){
validate19.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((key0 === "action") || (key0 === "requestId"))){
validate19.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.action !== undefined){
let data0 = data.action;
const _errs2 = errors;
const _errs4 = errors;
let valid2 = false;
let passing0 = null;
const _errs5 = errors;
if(errors === _errs5){
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
let missing1;
if(((data0.operation === undefined) && (missing1 = "operation")) || ((data0.text === undefined) && (missing1 = "text"))){
const err0 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/Action/oneOf/0/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
else {
const _errs7 = errors;
for(const key1 in data0){
if(!((key1 === "operation") || (key1 === "text"))){
const err1 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/Action/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
break;
}
}
if(_errs7 === errors){
if(data0.operation !== undefined){
let data1 = data0.operation;
const _errs8 = errors;
if(typeof data1 !== "string"){
const err2 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/Action/oneOf/0/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if("send" !== data1){
const err3 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/Action/oneOf/0/properties/operation/const",keyword:"const",params:{allowedValue: "send"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
var valid3 = _errs8 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data0.text !== undefined){
const _errs10 = errors;
if(typeof data0.text !== "string"){
const err4 = {instancePath:instancePath+"/action/text",schemaPath:"#/definitions/Action/oneOf/0/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
var valid3 = _errs10 === errors;
}
else {
var valid3 = true;
}
}
}
}
}
else {
const err5 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/Action/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
var _valid0 = _errs5 === errors;
if(_valid0){
valid2 = true;
passing0 = 0;
}
const _errs12 = errors;
if(errors === _errs12){
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
let missing2;
if((data0.operation === undefined) && (missing2 = "operation")){
const err6 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/Action/oneOf/1/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
else {
const _errs14 = errors;
for(const key2 in data0){
if(!(key2 === "operation")){
const err7 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/Action/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
break;
}
}
if(_errs14 === errors){
if(data0.operation !== undefined){
let data3 = data0.operation;
if(typeof data3 !== "string"){
const err8 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/Action/oneOf/1/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if("interrupt" !== data3){
const err9 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/Action/oneOf/1/properties/operation/const",keyword:"const",params:{allowedValue: "interrupt"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
}
}
}
else {
const err10 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/Action/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
var _valid0 = _errs12 === errors;
if(_valid0 && valid2){
valid2 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid2 = true;
passing0 = 1;
}
}
if(!valid2){
const err11 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/Action/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
validate19.errors = vErrors;
return false;
}
else {
errors = _errs4;
if(vErrors !== null){
if(_errs4){
vErrors.length = _errs4;
}
else {
vErrors = null;
}
}
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.requestId !== undefined){
const _errs17 = errors;
if(typeof data.requestId !== "string"){
validate19.errors = [{instancePath:instancePath+"/requestId",schemaPath:"#/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs17 === errors;
}
else {
var valid0 = true;
}
}
}
}
}
else {
validate19.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate19.errors = vErrors;
return errors === 0;
}

export const conversationSnapshot = validate20;
const schema32 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"definitions":{"Action":{"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"inspect","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"home","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"name":{"type":"string"},"operation":{"const":"save-layout","type":"string"}},"required":["operation","fleet","name"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"name":{"type":"string"},"operation":{"const":"load-layout","type":"string"}},"required":["operation","fleet","name"],"type":"object"},{"additionalProperties":false,"properties":{"cwd":{"type":"string"},"name":{"type":"string"},"operation":{"const":"create-voyage","type":"string"}},"required":["operation","name","cwd"],"type":"object"},{"additionalProperties":false,"properties":{"name":{"type":"string"},"operation":{"const":"create-fleet","type":"string"},"voyage":{"type":"string"}},"required":["operation","voyage","name"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"create-portal","type":"string"},"voyage":{"type":"string"}},"required":["operation","voyage"],"type":"object"},{"additionalProperties":false,"properties":{"destination":{"$ref":"#/definitions/ContentDestination"},"operation":{"const":"create-content","type":"string"},"typeId":{"type":"string"}},"required":["operation","typeId","destination"],"type":"object"},{"additionalProperties":false,"properties":{"name":{"type":"string"},"operation":{"const":"rename","type":"string"},"target":{"$ref":"#/definitions/RenameTarget"}},"required":["operation","target","name"],"type":"object"},{"additionalProperties":false,"properties":{"after":{"type":"string"},"axis":{"$ref":"#/definitions/Axis"},"fleet":{"type":"string"},"operation":{"const":"split","type":"string"}},"required":["operation","fleet","after","axis"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"operation":{"const":"resize-split","type":"string"},"path":{"items":{"$ref":"#/definitions/SplitChild"},"maxItems":128,"type":"array"},"share":{"$ref":"#/definitions/SplitShare"}},"required":["operation","fleet","path","share"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"move-vessel","type":"string"},"side":{"$ref":"#/definitions/Side"},"target":{"type":"string"}},"required":["operation","id","target","side"],"type":"object"},{"additionalProperties":false,"properties":{"before":{"type":"boolean"},"id":{"type":"string"},"operation":{"const":"move-voyage","type":"string"},"target":{"type":"string"}},"required":["operation","id","target","before"],"type":"object"},{"additionalProperties":false,"properties":{"before":{"type":"boolean"},"id":{"type":"string"},"operation":{"const":"move-fleet","type":"string"},"target":{"type":"string"}},"required":["operation","id","target","before"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"select-voyage","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"select-fleet","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"reveal-vessel","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"context":{"$ref":"#/definitions/Context"},"operation":{"const":"dock","type":"string"}},"required":["operation","context"],"type":"object"}]},"Axis":{"enum":["horizontal","vertical"],"type":"string"},"CallbackId":{"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"string","type":"string"},"value":{"type":"string"}},"required":["kind","value"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"integer","type":"string"},"value":{"pattern":"^-?[0-9]+$","type":"string"}},"required":["kind","value"],"type":"object"}]},"ContentDestination":{"oneOf":[{"additionalProperties":false,"properties":{"after":{"type":"string"},"axis":{"$ref":"#/definitions/Axis"},"fleet":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","fleet","after","axis"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"portal","type":"string"},"voyage":{"type":"string"}},"required":["kind","voyage"],"type":"object"}]},"Context":{"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"workspace","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]},"Focus":{"additionalProperties":false,"properties":{"cwd":{"type":["string","null"]},"path":{"items":{"type":"string"},"type":"array"},"revision":{"type":"string"},"scope":{"$ref":"#/definitions/Context"}},"required":["scope","path","revision"],"type":"object"},"Message":{"additionalProperties":false,"properties":{"context":{"anyOf":[{"$ref":"#/definitions/Focus"},{"type":"null"}]},"id":{"type":"string"},"requestId":{"type":"string"},"role":{"$ref":"#/definitions/Role"},"text":{"type":"string"},"tool":{"anyOf":[{"$ref":"#/definitions/ToolOutcome"},{"type":"null"}]}},"required":["id","requestId","role","text"],"type":"object"},"Phase":{"enum":["idle","starting","working","completed","interrupted","failed","unconfirmed"],"type":"string"},"ProcessAction":{"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"list","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"lines":{"maximum":160,"minimum":0,"type":"integer"},"operation":{"const":"read","type":"string"},"terminalId":{"type":"string"}},"required":["operation","contentId","terminalId","lines"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"send","type":"string"},"pid":{"maximum":4294967295,"minimum":0,"type":"integer"},"terminalId":{"type":"string"},"text":{"type":"string"}},"required":["operation","contentId","terminalId","pid","text"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"interrupt","type":"string"},"pid":{"maximum":4294967295,"minimum":0,"type":"integer"},"terminalId":{"type":"string"}},"required":["operation","contentId","terminalId","pid"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"stop","type":"string"},"pid":{"maximum":4294967295,"minimum":0,"type":"integer"},"terminalId":{"type":"string"}},"required":["operation","contentId","terminalId","pid"],"type":"object"}]},"Receipt":{"oneOf":[{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"describe","type":"string"}},"required":["operation","contentId"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"inspect","type":"string"}},"required":["operation","contentId"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"expectedRevision":{"type":"string"},"operation":{"const":"update","type":"string"}},"required":["operation","contentId","expectedRevision"],"type":"object"}]},"RenameTarget":{"oneOf":[{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]},"Role":{"enum":["user","assistant","tool"],"type":"string"},"Side":{"enum":["left","right","top","bottom"],"type":"string"},"SplitChild":{"enum":["first","second"],"type":"string"},"SplitShare":{"maximum":9999,"minimum":1,"type":"integer"},"Status":{"enum":["applied","rejected","uncertain"],"type":"string"},"ToolAction":{"oneOf":[{"additionalProperties":false,"properties":{"action":{"$ref":"#/definitions/Action"},"tool":{"const":"workspace","type":"string"}},"required":["tool","action"],"type":"object"},{"additionalProperties":false,"properties":{"action":{"$ref":"#/definitions/ProcessAction"},"tool":{"const":"process","type":"string"}},"required":["tool","action"],"type":"object"},{"additionalProperties":false,"properties":{"action":{"$ref":"#/definitions/Receipt"},"tool":{"const":"content","type":"string"}},"required":["tool","action"],"type":"object"}]},"ToolOutcome":{"additionalProperties":false,"properties":{"action":{"$ref":"#/definitions/ToolAction"},"callId":{"type":"string"},"callbackIds":{"items":{"$ref":"#/definitions/CallbackId"},"type":"array"},"name":{"type":"string"},"requestId":{"type":"string"},"status":{"$ref":"#/definitions/Status"},"version":{"type":["string","null"]}},"required":["name","callId","callbackIds","requestId","action","status"],"type":"object"}},"properties":{"error":{"type":["string","null"]},"limited":{"type":"boolean"},"messages":{"items":{"$ref":"#/definitions/Message"},"type":"array"},"model":{"type":["string","null"]},"omitted":{"type":"string"},"phase":{"$ref":"#/definitions/Phase"},"thread":{"type":["string","null"]},"turn":{"type":["string","null"]},"version":{"type":"string"}},"required":["version","phase","messages","limited","omitted"],"title":"Snapshot","type":"object"};
const schema52 = {"enum":["idle","starting","working","completed","interrupted","failed","unconfirmed"],"type":"string"};
const func2 = Object.prototype.hasOwnProperty;
const schema33 = {"additionalProperties":false,"properties":{"context":{"anyOf":[{"$ref":"#/definitions/Focus"},{"type":"null"}]},"id":{"type":"string"},"requestId":{"type":"string"},"role":{"$ref":"#/definitions/Role"},"text":{"type":"string"},"tool":{"anyOf":[{"$ref":"#/definitions/ToolOutcome"},{"type":"null"}]}},"required":["id","requestId","role","text"],"type":"object"};
const schema36 = {"enum":["user","assistant","tool"],"type":"string"};
const schema34 = {"additionalProperties":false,"properties":{"cwd":{"type":["string","null"]},"path":{"items":{"type":"string"},"type":"array"},"revision":{"type":"string"},"scope":{"$ref":"#/definitions/Context"}},"required":["scope","path","revision"],"type":"object"};
const schema35 = {"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"workspace","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]};

function validate22(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((((data.scope === undefined) && (missing0 = "scope")) || ((data.path === undefined) && (missing0 = "path"))) || ((data.revision === undefined) && (missing0 = "revision"))){
validate22.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((((key0 === "cwd") || (key0 === "path")) || (key0 === "revision")) || (key0 === "scope"))){
validate22.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.cwd !== undefined){
let data0 = data.cwd;
const _errs2 = errors;
if((typeof data0 !== "string") && (data0 !== null)){
validate22.errors = [{instancePath:instancePath+"/cwd",schemaPath:"#/properties/cwd/type",keyword:"type",params:{type: schema34.properties.cwd.type},message:"must be string,null"}];
return false;
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.path !== undefined){
let data1 = data.path;
const _errs4 = errors;
if(errors === _errs4){
if(Array.isArray(data1)){
var valid1 = true;
const len0 = data1.length;
for(let i0=0; i0<len0; i0++){
const _errs6 = errors;
if(typeof data1[i0] !== "string"){
validate22.errors = [{instancePath:instancePath+"/path/" + i0,schemaPath:"#/properties/path/items/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid1 = _errs6 === errors;
if(!valid1){
break;
}
}
}
else {
validate22.errors = [{instancePath:instancePath+"/path",schemaPath:"#/properties/path/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
var valid0 = _errs4 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.revision !== undefined){
const _errs8 = errors;
if(typeof data.revision !== "string"){
validate22.errors = [{instancePath:instancePath+"/revision",schemaPath:"#/properties/revision/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs8 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.scope !== undefined){
let data4 = data.scope;
const _errs10 = errors;
const _errs12 = errors;
let valid3 = false;
let passing0 = null;
const _errs13 = errors;
if(errors === _errs13){
if(data4 && typeof data4 == "object" && !Array.isArray(data4)){
let missing1;
if((data4.kind === undefined) && (missing1 = "kind")){
const err0 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf/0/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
else {
const _errs15 = errors;
for(const key1 in data4){
if(!(key1 === "kind")){
const err1 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
break;
}
}
if(_errs15 === errors){
if(data4.kind !== undefined){
let data5 = data4.kind;
if(typeof data5 !== "string"){
const err2 = {instancePath:instancePath+"/scope/kind",schemaPath:"#/definitions/Context/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if("workspace" !== data5){
const err3 = {instancePath:instancePath+"/scope/kind",schemaPath:"#/definitions/Context/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "workspace"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
}
}
}
else {
const err4 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
var _valid0 = _errs13 === errors;
if(_valid0){
valid3 = true;
passing0 = 0;
}
const _errs18 = errors;
if(errors === _errs18){
if(data4 && typeof data4 == "object" && !Array.isArray(data4)){
let missing2;
if(((data4.kind === undefined) && (missing2 = "kind")) || ((data4.id === undefined) && (missing2 = "id"))){
const err5 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf/1/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
else {
const _errs20 = errors;
for(const key2 in data4){
if(!((key2 === "id") || (key2 === "kind"))){
const err6 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
break;
}
}
if(_errs20 === errors){
if(data4.id !== undefined){
const _errs21 = errors;
if(typeof data4.id !== "string"){
const err7 = {instancePath:instancePath+"/scope/id",schemaPath:"#/definitions/Context/oneOf/1/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
var valid5 = _errs21 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data4.kind !== undefined){
let data7 = data4.kind;
const _errs23 = errors;
if(typeof data7 !== "string"){
const err8 = {instancePath:instancePath+"/scope/kind",schemaPath:"#/definitions/Context/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if("voyage" !== data7){
const err9 = {instancePath:instancePath+"/scope/kind",schemaPath:"#/definitions/Context/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
var valid5 = _errs23 === errors;
}
else {
var valid5 = true;
}
}
}
}
}
else {
const err10 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
var _valid0 = _errs18 === errors;
if(_valid0 && valid3){
valid3 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid3 = true;
passing0 = 1;
}
const _errs25 = errors;
if(errors === _errs25){
if(data4 && typeof data4 == "object" && !Array.isArray(data4)){
let missing3;
if(((data4.kind === undefined) && (missing3 = "kind")) || ((data4.id === undefined) && (missing3 = "id"))){
const err11 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf/2/required",keyword:"required",params:{missingProperty: missing3},message:"must have required property '"+missing3+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
else {
const _errs27 = errors;
for(const key3 in data4){
if(!((key3 === "id") || (key3 === "kind"))){
const err12 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
break;
}
}
if(_errs27 === errors){
if(data4.id !== undefined){
const _errs28 = errors;
if(typeof data4.id !== "string"){
const err13 = {instancePath:instancePath+"/scope/id",schemaPath:"#/definitions/Context/oneOf/2/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
var valid6 = _errs28 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data4.kind !== undefined){
let data9 = data4.kind;
const _errs30 = errors;
if(typeof data9 !== "string"){
const err14 = {instancePath:instancePath+"/scope/kind",schemaPath:"#/definitions/Context/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if("fleet" !== data9){
const err15 = {instancePath:instancePath+"/scope/kind",schemaPath:"#/definitions/Context/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
var valid6 = _errs30 === errors;
}
else {
var valid6 = true;
}
}
}
}
}
else {
const err16 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
var _valid0 = _errs25 === errors;
if(_valid0 && valid3){
valid3 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid3 = true;
passing0 = 2;
}
const _errs32 = errors;
if(errors === _errs32){
if(data4 && typeof data4 == "object" && !Array.isArray(data4)){
let missing4;
if(((data4.kind === undefined) && (missing4 = "kind")) || ((data4.id === undefined) && (missing4 = "id"))){
const err17 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf/3/required",keyword:"required",params:{missingProperty: missing4},message:"must have required property '"+missing4+"'"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
else {
const _errs34 = errors;
for(const key4 in data4){
if(!((key4 === "id") || (key4 === "kind"))){
const err18 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
break;
}
}
if(_errs34 === errors){
if(data4.id !== undefined){
const _errs35 = errors;
if(typeof data4.id !== "string"){
const err19 = {instancePath:instancePath+"/scope/id",schemaPath:"#/definitions/Context/oneOf/3/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
var valid7 = _errs35 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data4.kind !== undefined){
let data11 = data4.kind;
const _errs37 = errors;
if(typeof data11 !== "string"){
const err20 = {instancePath:instancePath+"/scope/kind",schemaPath:"#/definitions/Context/oneOf/3/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if("vessel" !== data11){
const err21 = {instancePath:instancePath+"/scope/kind",schemaPath:"#/definitions/Context/oneOf/3/properties/kind/const",keyword:"const",params:{allowedValue: "vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
var valid7 = _errs37 === errors;
}
else {
var valid7 = true;
}
}
}
}
}
else {
const err22 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
var _valid0 = _errs32 === errors;
if(_valid0 && valid3){
valid3 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid3 = true;
passing0 = 3;
}
const _errs39 = errors;
if(errors === _errs39){
if(data4 && typeof data4 == "object" && !Array.isArray(data4)){
let missing5;
if(((data4.kind === undefined) && (missing5 = "kind")) || ((data4.id === undefined) && (missing5 = "id"))){
const err23 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf/4/required",keyword:"required",params:{missingProperty: missing5},message:"must have required property '"+missing5+"'"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
else {
const _errs41 = errors;
for(const key5 in data4){
if(!((key5 === "id") || (key5 === "kind"))){
const err24 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
break;
}
}
if(_errs41 === errors){
if(data4.id !== undefined){
const _errs42 = errors;
if(typeof data4.id !== "string"){
const err25 = {instancePath:instancePath+"/scope/id",schemaPath:"#/definitions/Context/oneOf/4/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
var valid8 = _errs42 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data4.kind !== undefined){
let data13 = data4.kind;
const _errs44 = errors;
if(typeof data13 !== "string"){
const err26 = {instancePath:instancePath+"/scope/kind",schemaPath:"#/definitions/Context/oneOf/4/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if("portal" !== data13){
const err27 = {instancePath:instancePath+"/scope/kind",schemaPath:"#/definitions/Context/oneOf/4/properties/kind/const",keyword:"const",params:{allowedValue: "portal"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
var valid8 = _errs44 === errors;
}
else {
var valid8 = true;
}
}
}
}
}
else {
const err28 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
var _valid0 = _errs39 === errors;
if(_valid0 && valid3){
valid3 = false;
passing0 = [passing0, 4];
}
else {
if(_valid0){
valid3 = true;
passing0 = 4;
}
}
}
}
}
if(!valid3){
const err29 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
validate22.errors = vErrors;
return false;
}
else {
errors = _errs12;
if(vErrors !== null){
if(_errs12){
vErrors.length = _errs12;
}
else {
vErrors = null;
}
}
}
var valid0 = _errs10 === errors;
}
else {
var valid0 = true;
}
}
}
}
}
}
}
else {
validate22.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate22.errors = vErrors;
return errors === 0;
}

const schema37 = {"additionalProperties":false,"properties":{"action":{"$ref":"#/definitions/ToolAction"},"callId":{"type":"string"},"callbackIds":{"items":{"$ref":"#/definitions/CallbackId"},"type":"array"},"name":{"type":"string"},"requestId":{"type":"string"},"status":{"$ref":"#/definitions/Status"},"version":{"type":["string","null"]}},"required":["name","callId","callbackIds","requestId","action","status"],"type":"object"};
const schema50 = {"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"string","type":"string"},"value":{"type":"string"}},"required":["kind","value"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"integer","type":"string"},"value":{"pattern":"^-?[0-9]+$","type":"string"}},"required":["kind","value"],"type":"object"}]};
const schema51 = {"enum":["applied","rejected","uncertain"],"type":"string"};
const schema38 = {"oneOf":[{"additionalProperties":false,"properties":{"action":{"$ref":"#/definitions/Action"},"tool":{"const":"workspace","type":"string"}},"required":["tool","action"],"type":"object"},{"additionalProperties":false,"properties":{"action":{"$ref":"#/definitions/ProcessAction"},"tool":{"const":"process","type":"string"}},"required":["tool","action"],"type":"object"},{"additionalProperties":false,"properties":{"action":{"$ref":"#/definitions/Receipt"},"tool":{"const":"content","type":"string"}},"required":["tool","action"],"type":"object"}]};
const schema48 = {"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"list","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"lines":{"maximum":160,"minimum":0,"type":"integer"},"operation":{"const":"read","type":"string"},"terminalId":{"type":"string"}},"required":["operation","contentId","terminalId","lines"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"send","type":"string"},"pid":{"maximum":4294967295,"minimum":0,"type":"integer"},"terminalId":{"type":"string"},"text":{"type":"string"}},"required":["operation","contentId","terminalId","pid","text"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"interrupt","type":"string"},"pid":{"maximum":4294967295,"minimum":0,"type":"integer"},"terminalId":{"type":"string"}},"required":["operation","contentId","terminalId","pid"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"stop","type":"string"},"pid":{"maximum":4294967295,"minimum":0,"type":"integer"},"terminalId":{"type":"string"}},"required":["operation","contentId","terminalId","pid"],"type":"object"}]};
const schema49 = {"oneOf":[{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"describe","type":"string"}},"required":["operation","contentId"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"inspect","type":"string"}},"required":["operation","contentId"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"expectedRevision":{"type":"string"},"operation":{"const":"update","type":"string"}},"required":["operation","contentId","expectedRevision"],"type":"object"}]};
const schema39 = {"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"inspect","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"home","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"name":{"type":"string"},"operation":{"const":"save-layout","type":"string"}},"required":["operation","fleet","name"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"name":{"type":"string"},"operation":{"const":"load-layout","type":"string"}},"required":["operation","fleet","name"],"type":"object"},{"additionalProperties":false,"properties":{"cwd":{"type":"string"},"name":{"type":"string"},"operation":{"const":"create-voyage","type":"string"}},"required":["operation","name","cwd"],"type":"object"},{"additionalProperties":false,"properties":{"name":{"type":"string"},"operation":{"const":"create-fleet","type":"string"},"voyage":{"type":"string"}},"required":["operation","voyage","name"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"create-portal","type":"string"},"voyage":{"type":"string"}},"required":["operation","voyage"],"type":"object"},{"additionalProperties":false,"properties":{"destination":{"$ref":"#/definitions/ContentDestination"},"operation":{"const":"create-content","type":"string"},"typeId":{"type":"string"}},"required":["operation","typeId","destination"],"type":"object"},{"additionalProperties":false,"properties":{"name":{"type":"string"},"operation":{"const":"rename","type":"string"},"target":{"$ref":"#/definitions/RenameTarget"}},"required":["operation","target","name"],"type":"object"},{"additionalProperties":false,"properties":{"after":{"type":"string"},"axis":{"$ref":"#/definitions/Axis"},"fleet":{"type":"string"},"operation":{"const":"split","type":"string"}},"required":["operation","fleet","after","axis"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"operation":{"const":"resize-split","type":"string"},"path":{"items":{"$ref":"#/definitions/SplitChild"},"maxItems":128,"type":"array"},"share":{"$ref":"#/definitions/SplitShare"}},"required":["operation","fleet","path","share"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"move-vessel","type":"string"},"side":{"$ref":"#/definitions/Side"},"target":{"type":"string"}},"required":["operation","id","target","side"],"type":"object"},{"additionalProperties":false,"properties":{"before":{"type":"boolean"},"id":{"type":"string"},"operation":{"const":"move-voyage","type":"string"},"target":{"type":"string"}},"required":["operation","id","target","before"],"type":"object"},{"additionalProperties":false,"properties":{"before":{"type":"boolean"},"id":{"type":"string"},"operation":{"const":"move-fleet","type":"string"},"target":{"type":"string"}},"required":["operation","id","target","before"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"select-voyage","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"select-fleet","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"reveal-vessel","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"context":{"$ref":"#/definitions/Context"},"operation":{"const":"dock","type":"string"}},"required":["operation","context"],"type":"object"}]};
const schema42 = {"oneOf":[{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]};
const schema41 = {"enum":["horizontal","vertical"],"type":"string"};
const schema44 = {"enum":["first","second"],"type":"string"};
const schema45 = {"maximum":9999,"minimum":1,"type":"integer"};
const schema46 = {"enum":["left","right","top","bottom"],"type":"string"};
const schema40 = {"oneOf":[{"additionalProperties":false,"properties":{"after":{"type":"string"},"axis":{"$ref":"#/definitions/Axis"},"fleet":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","fleet","after","axis"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"portal","type":"string"},"voyage":{"type":"string"}},"required":["kind","voyage"],"type":"object"}]};

function validate27(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(errors === _errs1){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((((data.kind === undefined) && (missing0 = "kind")) || ((data.fleet === undefined) && (missing0 = "fleet"))) || ((data.after === undefined) && (missing0 = "after"))) || ((data.axis === undefined) && (missing0 = "axis"))){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
else {
const _errs3 = errors;
for(const key0 in data){
if(!((((key0 === "after") || (key0 === "axis")) || (key0 === "fleet")) || (key0 === "kind"))){
const err1 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
break;
}
}
if(_errs3 === errors){
if(data.after !== undefined){
const _errs4 = errors;
if(typeof data.after !== "string"){
const err2 = {instancePath:instancePath+"/after",schemaPath:"#/oneOf/0/properties/after/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
var valid1 = _errs4 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.axis !== undefined){
let data1 = data.axis;
const _errs6 = errors;
if(typeof data1 !== "string"){
const err3 = {instancePath:instancePath+"/axis",schemaPath:"#/definitions/Axis/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(!((data1 === "horizontal") || (data1 === "vertical"))){
const err4 = {instancePath:instancePath+"/axis",schemaPath:"#/definitions/Axis/enum",keyword:"enum",params:{allowedValues: schema41.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
var valid1 = _errs6 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.fleet !== undefined){
const _errs9 = errors;
if(typeof data.fleet !== "string"){
const err5 = {instancePath:instancePath+"/fleet",schemaPath:"#/oneOf/0/properties/fleet/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
var valid1 = _errs9 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.kind !== undefined){
let data3 = data.kind;
const _errs11 = errors;
if(typeof data3 !== "string"){
const err6 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if("vessel" !== data3){
const err7 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
var valid1 = _errs11 === errors;
}
else {
var valid1 = true;
}
}
}
}
}
}
}
else {
const err8 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
}
const _errs13 = errors;
if(errors === _errs13){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing1;
if(((data.kind === undefined) && (missing1 = "kind")) || ((data.voyage === undefined) && (missing1 = "voyage"))){
const err9 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
else {
const _errs15 = errors;
for(const key1 in data){
if(!((key1 === "kind") || (key1 === "voyage"))){
const err10 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
break;
}
}
if(_errs15 === errors){
if(data.kind !== undefined){
let data4 = data.kind;
const _errs16 = errors;
if(typeof data4 !== "string"){
const err11 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if("portal" !== data4){
const err12 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "portal"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
var valid3 = _errs16 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data.voyage !== undefined){
const _errs18 = errors;
if(typeof data.voyage !== "string"){
const err13 = {instancePath:instancePath+"/voyage",schemaPath:"#/oneOf/1/properties/voyage/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
var valid3 = _errs18 === errors;
}
else {
var valid3 = true;
}
}
}
}
}
else {
const err14 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
var _valid0 = _errs13 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
}
}
if(!valid0){
const err15 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
validate27.errors = vErrors;
return false;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate27.errors = vErrors;
return errors === 0;
}


function validate26(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(errors === _errs1){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((data.operation === undefined) && (missing0 = "operation")){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
else {
const _errs3 = errors;
for(const key0 in data){
if(!(key0 === "operation")){
const err1 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
break;
}
}
if(_errs3 === errors){
if(data.operation !== undefined){
let data0 = data.operation;
if(typeof data0 !== "string"){
const err2 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/0/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if("inspect" !== data0){
const err3 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/0/properties/operation/const",keyword:"const",params:{allowedValue: "inspect"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
}
}
}
else {
const err4 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
}
const _errs6 = errors;
if(errors === _errs6){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing1;
if((data.operation === undefined) && (missing1 = "operation")){
const err5 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
else {
const _errs8 = errors;
for(const key1 in data){
if(!(key1 === "operation")){
const err6 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
break;
}
}
if(_errs8 === errors){
if(data.operation !== undefined){
let data1 = data.operation;
if(typeof data1 !== "string"){
const err7 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/1/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if("home" !== data1){
const err8 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/1/properties/operation/const",keyword:"const",params:{allowedValue: "home"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
}
}
}
else {
const err9 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
var _valid0 = _errs6 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
}
const _errs11 = errors;
if(errors === _errs11){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing2;
if((((data.operation === undefined) && (missing2 = "operation")) || ((data.fleet === undefined) && (missing2 = "fleet"))) || ((data.name === undefined) && (missing2 = "name"))){
const err10 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
else {
const _errs13 = errors;
for(const key2 in data){
if(!(((key2 === "fleet") || (key2 === "name")) || (key2 === "operation"))){
const err11 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
break;
}
}
if(_errs13 === errors){
if(data.fleet !== undefined){
const _errs14 = errors;
if(typeof data.fleet !== "string"){
const err12 = {instancePath:instancePath+"/fleet",schemaPath:"#/oneOf/2/properties/fleet/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
var valid3 = _errs14 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data.name !== undefined){
const _errs16 = errors;
if(typeof data.name !== "string"){
const err13 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/2/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
var valid3 = _errs16 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data.operation !== undefined){
let data4 = data.operation;
const _errs18 = errors;
if(typeof data4 !== "string"){
const err14 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/2/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if("save-layout" !== data4){
const err15 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/2/properties/operation/const",keyword:"const",params:{allowedValue: "save-layout"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
var valid3 = _errs18 === errors;
}
else {
var valid3 = true;
}
}
}
}
}
}
else {
const err16 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
var _valid0 = _errs11 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
}
const _errs20 = errors;
if(errors === _errs20){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing3;
if((((data.operation === undefined) && (missing3 = "operation")) || ((data.fleet === undefined) && (missing3 = "fleet"))) || ((data.name === undefined) && (missing3 = "name"))){
const err17 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: missing3},message:"must have required property '"+missing3+"'"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
else {
const _errs22 = errors;
for(const key3 in data){
if(!(((key3 === "fleet") || (key3 === "name")) || (key3 === "operation"))){
const err18 = {instancePath,schemaPath:"#/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
break;
}
}
if(_errs22 === errors){
if(data.fleet !== undefined){
const _errs23 = errors;
if(typeof data.fleet !== "string"){
const err19 = {instancePath:instancePath+"/fleet",schemaPath:"#/oneOf/3/properties/fleet/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
var valid4 = _errs23 === errors;
}
else {
var valid4 = true;
}
if(valid4){
if(data.name !== undefined){
const _errs25 = errors;
if(typeof data.name !== "string"){
const err20 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/3/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
var valid4 = _errs25 === errors;
}
else {
var valid4 = true;
}
if(valid4){
if(data.operation !== undefined){
let data7 = data.operation;
const _errs27 = errors;
if(typeof data7 !== "string"){
const err21 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/3/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if("load-layout" !== data7){
const err22 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/3/properties/operation/const",keyword:"const",params:{allowedValue: "load-layout"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
var valid4 = _errs27 === errors;
}
else {
var valid4 = true;
}
}
}
}
}
}
else {
const err23 = {instancePath,schemaPath:"#/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
var _valid0 = _errs20 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid0 = true;
passing0 = 3;
}
const _errs29 = errors;
if(errors === _errs29){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing4;
if((((data.operation === undefined) && (missing4 = "operation")) || ((data.name === undefined) && (missing4 = "name"))) || ((data.cwd === undefined) && (missing4 = "cwd"))){
const err24 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: missing4},message:"must have required property '"+missing4+"'"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
else {
const _errs31 = errors;
for(const key4 in data){
if(!(((key4 === "cwd") || (key4 === "name")) || (key4 === "operation"))){
const err25 = {instancePath,schemaPath:"#/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
break;
}
}
if(_errs31 === errors){
if(data.cwd !== undefined){
const _errs32 = errors;
if(typeof data.cwd !== "string"){
const err26 = {instancePath:instancePath+"/cwd",schemaPath:"#/oneOf/4/properties/cwd/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
var valid5 = _errs32 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data.name !== undefined){
const _errs34 = errors;
if(typeof data.name !== "string"){
const err27 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/4/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
var valid5 = _errs34 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data.operation !== undefined){
let data10 = data.operation;
const _errs36 = errors;
if(typeof data10 !== "string"){
const err28 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/4/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if("create-voyage" !== data10){
const err29 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/4/properties/operation/const",keyword:"const",params:{allowedValue: "create-voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
var valid5 = _errs36 === errors;
}
else {
var valid5 = true;
}
}
}
}
}
}
else {
const err30 = {instancePath,schemaPath:"#/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
var _valid0 = _errs29 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 4];
}
else {
if(_valid0){
valid0 = true;
passing0 = 4;
}
const _errs38 = errors;
if(errors === _errs38){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing5;
if((((data.operation === undefined) && (missing5 = "operation")) || ((data.voyage === undefined) && (missing5 = "voyage"))) || ((data.name === undefined) && (missing5 = "name"))){
const err31 = {instancePath,schemaPath:"#/oneOf/5/required",keyword:"required",params:{missingProperty: missing5},message:"must have required property '"+missing5+"'"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
else {
const _errs40 = errors;
for(const key5 in data){
if(!(((key5 === "name") || (key5 === "operation")) || (key5 === "voyage"))){
const err32 = {instancePath,schemaPath:"#/oneOf/5/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
break;
}
}
if(_errs40 === errors){
if(data.name !== undefined){
const _errs41 = errors;
if(typeof data.name !== "string"){
const err33 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/5/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
var valid6 = _errs41 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data.operation !== undefined){
let data12 = data.operation;
const _errs43 = errors;
if(typeof data12 !== "string"){
const err34 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/5/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
if("create-fleet" !== data12){
const err35 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/5/properties/operation/const",keyword:"const",params:{allowedValue: "create-fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
var valid6 = _errs43 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data.voyage !== undefined){
const _errs45 = errors;
if(typeof data.voyage !== "string"){
const err36 = {instancePath:instancePath+"/voyage",schemaPath:"#/oneOf/5/properties/voyage/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
var valid6 = _errs45 === errors;
}
else {
var valid6 = true;
}
}
}
}
}
}
else {
const err37 = {instancePath,schemaPath:"#/oneOf/5/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
var _valid0 = _errs38 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 5];
}
else {
if(_valid0){
valid0 = true;
passing0 = 5;
}
const _errs47 = errors;
if(errors === _errs47){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing6;
if(((data.operation === undefined) && (missing6 = "operation")) || ((data.voyage === undefined) && (missing6 = "voyage"))){
const err38 = {instancePath,schemaPath:"#/oneOf/6/required",keyword:"required",params:{missingProperty: missing6},message:"must have required property '"+missing6+"'"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
else {
const _errs49 = errors;
for(const key6 in data){
if(!((key6 === "operation") || (key6 === "voyage"))){
const err39 = {instancePath,schemaPath:"#/oneOf/6/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
break;
}
}
if(_errs49 === errors){
if(data.operation !== undefined){
let data14 = data.operation;
const _errs50 = errors;
if(typeof data14 !== "string"){
const err40 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/6/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
if("create-portal" !== data14){
const err41 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/6/properties/operation/const",keyword:"const",params:{allowedValue: "create-portal"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
var valid7 = _errs50 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data.voyage !== undefined){
const _errs52 = errors;
if(typeof data.voyage !== "string"){
const err42 = {instancePath:instancePath+"/voyage",schemaPath:"#/oneOf/6/properties/voyage/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
var valid7 = _errs52 === errors;
}
else {
var valid7 = true;
}
}
}
}
}
else {
const err43 = {instancePath,schemaPath:"#/oneOf/6/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
var _valid0 = _errs47 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 6];
}
else {
if(_valid0){
valid0 = true;
passing0 = 6;
}
const _errs54 = errors;
if(errors === _errs54){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing7;
if((((data.operation === undefined) && (missing7 = "operation")) || ((data.typeId === undefined) && (missing7 = "typeId"))) || ((data.destination === undefined) && (missing7 = "destination"))){
const err44 = {instancePath,schemaPath:"#/oneOf/7/required",keyword:"required",params:{missingProperty: missing7},message:"must have required property '"+missing7+"'"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
else {
const _errs56 = errors;
for(const key7 in data){
if(!(((key7 === "destination") || (key7 === "operation")) || (key7 === "typeId"))){
const err45 = {instancePath,schemaPath:"#/oneOf/7/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key7},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
break;
}
}
if(_errs56 === errors){
if(data.destination !== undefined){
const _errs57 = errors;
if(!(validate27(data.destination, {instancePath:instancePath+"/destination",parentData:data,parentDataProperty:"destination",rootData}))){
vErrors = vErrors === null ? validate27.errors : vErrors.concat(validate27.errors);
errors = vErrors.length;
}
var valid8 = _errs57 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data.operation !== undefined){
let data17 = data.operation;
const _errs58 = errors;
if(typeof data17 !== "string"){
const err46 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/7/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
if("create-content" !== data17){
const err47 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/7/properties/operation/const",keyword:"const",params:{allowedValue: "create-content"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
var valid8 = _errs58 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data.typeId !== undefined){
const _errs60 = errors;
if(typeof data.typeId !== "string"){
const err48 = {instancePath:instancePath+"/typeId",schemaPath:"#/oneOf/7/properties/typeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
var valid8 = _errs60 === errors;
}
else {
var valid8 = true;
}
}
}
}
}
}
else {
const err49 = {instancePath,schemaPath:"#/oneOf/7/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
var _valid0 = _errs54 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 7];
}
else {
if(_valid0){
valid0 = true;
passing0 = 7;
}
const _errs62 = errors;
if(errors === _errs62){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing8;
if((((data.operation === undefined) && (missing8 = "operation")) || ((data.target === undefined) && (missing8 = "target"))) || ((data.name === undefined) && (missing8 = "name"))){
const err50 = {instancePath,schemaPath:"#/oneOf/8/required",keyword:"required",params:{missingProperty: missing8},message:"must have required property '"+missing8+"'"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
else {
const _errs64 = errors;
for(const key8 in data){
if(!(((key8 === "name") || (key8 === "operation")) || (key8 === "target"))){
const err51 = {instancePath,schemaPath:"#/oneOf/8/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key8},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
break;
}
}
if(_errs64 === errors){
if(data.name !== undefined){
const _errs65 = errors;
if(typeof data.name !== "string"){
const err52 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/8/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
var valid9 = _errs65 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data.operation !== undefined){
let data20 = data.operation;
const _errs67 = errors;
if(typeof data20 !== "string"){
const err53 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/8/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
if("rename" !== data20){
const err54 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/8/properties/operation/const",keyword:"const",params:{allowedValue: "rename"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
var valid9 = _errs67 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data.target !== undefined){
let data21 = data.target;
const _errs69 = errors;
const _errs71 = errors;
let valid11 = false;
let passing1 = null;
const _errs72 = errors;
if(errors === _errs72){
if(data21 && typeof data21 == "object" && !Array.isArray(data21)){
let missing9;
if(((data21.kind === undefined) && (missing9 = "kind")) || ((data21.id === undefined) && (missing9 = "id"))){
const err55 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/0/required",keyword:"required",params:{missingProperty: missing9},message:"must have required property '"+missing9+"'"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
else {
const _errs74 = errors;
for(const key9 in data21){
if(!((key9 === "id") || (key9 === "kind"))){
const err56 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key9},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
break;
}
}
if(_errs74 === errors){
if(data21.id !== undefined){
const _errs75 = errors;
if(typeof data21.id !== "string"){
const err57 = {instancePath:instancePath+"/target/id",schemaPath:"#/definitions/RenameTarget/oneOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
var valid12 = _errs75 === errors;
}
else {
var valid12 = true;
}
if(valid12){
if(data21.kind !== undefined){
let data23 = data21.kind;
const _errs77 = errors;
if(typeof data23 !== "string"){
const err58 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
if("voyage" !== data23){
const err59 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
var valid12 = _errs77 === errors;
}
else {
var valid12 = true;
}
}
}
}
}
else {
const err60 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
var _valid1 = _errs72 === errors;
if(_valid1){
valid11 = true;
passing1 = 0;
}
const _errs79 = errors;
if(errors === _errs79){
if(data21 && typeof data21 == "object" && !Array.isArray(data21)){
let missing10;
if(((data21.kind === undefined) && (missing10 = "kind")) || ((data21.id === undefined) && (missing10 = "id"))){
const err61 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/1/required",keyword:"required",params:{missingProperty: missing10},message:"must have required property '"+missing10+"'"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
else {
const _errs81 = errors;
for(const key10 in data21){
if(!((key10 === "id") || (key10 === "kind"))){
const err62 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key10},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
break;
}
}
if(_errs81 === errors){
if(data21.id !== undefined){
const _errs82 = errors;
if(typeof data21.id !== "string"){
const err63 = {instancePath:instancePath+"/target/id",schemaPath:"#/definitions/RenameTarget/oneOf/1/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
var valid13 = _errs82 === errors;
}
else {
var valid13 = true;
}
if(valid13){
if(data21.kind !== undefined){
let data25 = data21.kind;
const _errs84 = errors;
if(typeof data25 !== "string"){
const err64 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
if("fleet" !== data25){
const err65 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
var valid13 = _errs84 === errors;
}
else {
var valid13 = true;
}
}
}
}
}
else {
const err66 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
}
var _valid1 = _errs79 === errors;
if(_valid1 && valid11){
valid11 = false;
passing1 = [passing1, 1];
}
else {
if(_valid1){
valid11 = true;
passing1 = 1;
}
const _errs86 = errors;
if(errors === _errs86){
if(data21 && typeof data21 == "object" && !Array.isArray(data21)){
let missing11;
if(((data21.kind === undefined) && (missing11 = "kind")) || ((data21.id === undefined) && (missing11 = "id"))){
const err67 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/2/required",keyword:"required",params:{missingProperty: missing11},message:"must have required property '"+missing11+"'"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
else {
const _errs88 = errors;
for(const key11 in data21){
if(!((key11 === "id") || (key11 === "kind"))){
const err68 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key11},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
break;
}
}
if(_errs88 === errors){
if(data21.id !== undefined){
const _errs89 = errors;
if(typeof data21.id !== "string"){
const err69 = {instancePath:instancePath+"/target/id",schemaPath:"#/definitions/RenameTarget/oneOf/2/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
var valid14 = _errs89 === errors;
}
else {
var valid14 = true;
}
if(valid14){
if(data21.kind !== undefined){
let data27 = data21.kind;
const _errs91 = errors;
if(typeof data27 !== "string"){
const err70 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
if("vessel" !== data27){
const err71 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
var valid14 = _errs91 === errors;
}
else {
var valid14 = true;
}
}
}
}
}
else {
const err72 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
}
var _valid1 = _errs86 === errors;
if(_valid1 && valid11){
valid11 = false;
passing1 = [passing1, 2];
}
else {
if(_valid1){
valid11 = true;
passing1 = 2;
}
const _errs93 = errors;
if(errors === _errs93){
if(data21 && typeof data21 == "object" && !Array.isArray(data21)){
let missing12;
if(((data21.kind === undefined) && (missing12 = "kind")) || ((data21.id === undefined) && (missing12 = "id"))){
const err73 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/3/required",keyword:"required",params:{missingProperty: missing12},message:"must have required property '"+missing12+"'"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
else {
const _errs95 = errors;
for(const key12 in data21){
if(!((key12 === "id") || (key12 === "kind"))){
const err74 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key12},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
break;
}
}
if(_errs95 === errors){
if(data21.id !== undefined){
const _errs96 = errors;
if(typeof data21.id !== "string"){
const err75 = {instancePath:instancePath+"/target/id",schemaPath:"#/definitions/RenameTarget/oneOf/3/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
var valid15 = _errs96 === errors;
}
else {
var valid15 = true;
}
if(valid15){
if(data21.kind !== undefined){
let data29 = data21.kind;
const _errs98 = errors;
if(typeof data29 !== "string"){
const err76 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/3/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
if("portal" !== data29){
const err77 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/3/properties/kind/const",keyword:"const",params:{allowedValue: "portal"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
var valid15 = _errs98 === errors;
}
else {
var valid15 = true;
}
}
}
}
}
else {
const err78 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
}
var _valid1 = _errs93 === errors;
if(_valid1 && valid11){
valid11 = false;
passing1 = [passing1, 3];
}
else {
if(_valid1){
valid11 = true;
passing1 = 3;
}
}
}
}
if(!valid11){
const err79 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf",keyword:"oneOf",params:{passingSchemas: passing1},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
else {
errors = _errs71;
if(vErrors !== null){
if(_errs71){
vErrors.length = _errs71;
}
else {
vErrors = null;
}
}
}
var valid9 = _errs69 === errors;
}
else {
var valid9 = true;
}
}
}
}
}
}
else {
const err80 = {instancePath,schemaPath:"#/oneOf/8/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
}
var _valid0 = _errs62 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 8];
}
else {
if(_valid0){
valid0 = true;
passing0 = 8;
}
const _errs100 = errors;
if(errors === _errs100){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing13;
if(((((data.operation === undefined) && (missing13 = "operation")) || ((data.fleet === undefined) && (missing13 = "fleet"))) || ((data.after === undefined) && (missing13 = "after"))) || ((data.axis === undefined) && (missing13 = "axis"))){
const err81 = {instancePath,schemaPath:"#/oneOf/9/required",keyword:"required",params:{missingProperty: missing13},message:"must have required property '"+missing13+"'"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
else {
const _errs102 = errors;
for(const key13 in data){
if(!((((key13 === "after") || (key13 === "axis")) || (key13 === "fleet")) || (key13 === "operation"))){
const err82 = {instancePath,schemaPath:"#/oneOf/9/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key13},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
break;
}
}
if(_errs102 === errors){
if(data.after !== undefined){
const _errs103 = errors;
if(typeof data.after !== "string"){
const err83 = {instancePath:instancePath+"/after",schemaPath:"#/oneOf/9/properties/after/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
var valid16 = _errs103 === errors;
}
else {
var valid16 = true;
}
if(valid16){
if(data.axis !== undefined){
let data31 = data.axis;
const _errs105 = errors;
if(typeof data31 !== "string"){
const err84 = {instancePath:instancePath+"/axis",schemaPath:"#/definitions/Axis/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
if(!((data31 === "horizontal") || (data31 === "vertical"))){
const err85 = {instancePath:instancePath+"/axis",schemaPath:"#/definitions/Axis/enum",keyword:"enum",params:{allowedValues: schema41.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
var valid16 = _errs105 === errors;
}
else {
var valid16 = true;
}
if(valid16){
if(data.fleet !== undefined){
const _errs108 = errors;
if(typeof data.fleet !== "string"){
const err86 = {instancePath:instancePath+"/fleet",schemaPath:"#/oneOf/9/properties/fleet/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
var valid16 = _errs108 === errors;
}
else {
var valid16 = true;
}
if(valid16){
if(data.operation !== undefined){
let data33 = data.operation;
const _errs110 = errors;
if(typeof data33 !== "string"){
const err87 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/9/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
if("split" !== data33){
const err88 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/9/properties/operation/const",keyword:"const",params:{allowedValue: "split"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
var valid16 = _errs110 === errors;
}
else {
var valid16 = true;
}
}
}
}
}
}
}
else {
const err89 = {instancePath,schemaPath:"#/oneOf/9/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
}
var _valid0 = _errs100 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 9];
}
else {
if(_valid0){
valid0 = true;
passing0 = 9;
}
const _errs112 = errors;
if(errors === _errs112){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing14;
if(((((data.operation === undefined) && (missing14 = "operation")) || ((data.fleet === undefined) && (missing14 = "fleet"))) || ((data.path === undefined) && (missing14 = "path"))) || ((data.share === undefined) && (missing14 = "share"))){
const err90 = {instancePath,schemaPath:"#/oneOf/10/required",keyword:"required",params:{missingProperty: missing14},message:"must have required property '"+missing14+"'"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
else {
const _errs114 = errors;
for(const key14 in data){
if(!((((key14 === "fleet") || (key14 === "operation")) || (key14 === "path")) || (key14 === "share"))){
const err91 = {instancePath,schemaPath:"#/oneOf/10/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key14},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
break;
}
}
if(_errs114 === errors){
if(data.fleet !== undefined){
const _errs115 = errors;
if(typeof data.fleet !== "string"){
const err92 = {instancePath:instancePath+"/fleet",schemaPath:"#/oneOf/10/properties/fleet/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
var valid18 = _errs115 === errors;
}
else {
var valid18 = true;
}
if(valid18){
if(data.operation !== undefined){
let data35 = data.operation;
const _errs117 = errors;
if(typeof data35 !== "string"){
const err93 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/10/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err93];
}
else {
vErrors.push(err93);
}
errors++;
}
if("resize-split" !== data35){
const err94 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/10/properties/operation/const",keyword:"const",params:{allowedValue: "resize-split"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
var valid18 = _errs117 === errors;
}
else {
var valid18 = true;
}
if(valid18){
if(data.path !== undefined){
let data36 = data.path;
const _errs119 = errors;
if(errors === _errs119){
if(Array.isArray(data36)){
if(data36.length > 128){
const err95 = {instancePath:instancePath+"/path",schemaPath:"#/oneOf/10/properties/path/maxItems",keyword:"maxItems",params:{limit: 128},message:"must NOT have more than 128 items"};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
else {
var valid19 = true;
const len0 = data36.length;
for(let i0=0; i0<len0; i0++){
let data37 = data36[i0];
const _errs121 = errors;
if(typeof data37 !== "string"){
const err96 = {instancePath:instancePath+"/path/" + i0,schemaPath:"#/definitions/SplitChild/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
if(!((data37 === "first") || (data37 === "second"))){
const err97 = {instancePath:instancePath+"/path/" + i0,schemaPath:"#/definitions/SplitChild/enum",keyword:"enum",params:{allowedValues: schema44.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
var valid19 = _errs121 === errors;
if(!valid19){
break;
}
}
}
}
else {
const err98 = {instancePath:instancePath+"/path",schemaPath:"#/oneOf/10/properties/path/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err98];
}
else {
vErrors.push(err98);
}
errors++;
}
}
var valid18 = _errs119 === errors;
}
else {
var valid18 = true;
}
if(valid18){
if(data.share !== undefined){
let data38 = data.share;
const _errs124 = errors;
const _errs125 = errors;
if(!(((typeof data38 == "number") && (!(data38 % 1) && !isNaN(data38))) && (isFinite(data38)))){
const err99 = {instancePath:instancePath+"/share",schemaPath:"#/definitions/SplitShare/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err99];
}
else {
vErrors.push(err99);
}
errors++;
}
if(errors === _errs125){
if((typeof data38 == "number") && (isFinite(data38))){
if(data38 > 9999 || isNaN(data38)){
const err100 = {instancePath:instancePath+"/share",schemaPath:"#/definitions/SplitShare/maximum",keyword:"maximum",params:{comparison: "<=", limit: 9999},message:"must be <= 9999"};
if(vErrors === null){
vErrors = [err100];
}
else {
vErrors.push(err100);
}
errors++;
}
else {
if(data38 < 1 || isNaN(data38)){
const err101 = {instancePath:instancePath+"/share",schemaPath:"#/definitions/SplitShare/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err101];
}
else {
vErrors.push(err101);
}
errors++;
}
}
}
}
var valid18 = _errs124 === errors;
}
else {
var valid18 = true;
}
}
}
}
}
}
}
else {
const err102 = {instancePath,schemaPath:"#/oneOf/10/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err102];
}
else {
vErrors.push(err102);
}
errors++;
}
}
var _valid0 = _errs112 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 10];
}
else {
if(_valid0){
valid0 = true;
passing0 = 10;
}
const _errs127 = errors;
if(errors === _errs127){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing15;
if(((((data.operation === undefined) && (missing15 = "operation")) || ((data.id === undefined) && (missing15 = "id"))) || ((data.target === undefined) && (missing15 = "target"))) || ((data.side === undefined) && (missing15 = "side"))){
const err103 = {instancePath,schemaPath:"#/oneOf/11/required",keyword:"required",params:{missingProperty: missing15},message:"must have required property '"+missing15+"'"};
if(vErrors === null){
vErrors = [err103];
}
else {
vErrors.push(err103);
}
errors++;
}
else {
const _errs129 = errors;
for(const key15 in data){
if(!((((key15 === "id") || (key15 === "operation")) || (key15 === "side")) || (key15 === "target"))){
const err104 = {instancePath,schemaPath:"#/oneOf/11/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key15},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err104];
}
else {
vErrors.push(err104);
}
errors++;
break;
}
}
if(_errs129 === errors){
if(data.id !== undefined){
const _errs130 = errors;
if(typeof data.id !== "string"){
const err105 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/11/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err105];
}
else {
vErrors.push(err105);
}
errors++;
}
var valid22 = _errs130 === errors;
}
else {
var valid22 = true;
}
if(valid22){
if(data.operation !== undefined){
let data40 = data.operation;
const _errs132 = errors;
if(typeof data40 !== "string"){
const err106 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/11/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err106];
}
else {
vErrors.push(err106);
}
errors++;
}
if("move-vessel" !== data40){
const err107 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/11/properties/operation/const",keyword:"const",params:{allowedValue: "move-vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err107];
}
else {
vErrors.push(err107);
}
errors++;
}
var valid22 = _errs132 === errors;
}
else {
var valid22 = true;
}
if(valid22){
if(data.side !== undefined){
let data41 = data.side;
const _errs134 = errors;
if(typeof data41 !== "string"){
const err108 = {instancePath:instancePath+"/side",schemaPath:"#/definitions/Side/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err108];
}
else {
vErrors.push(err108);
}
errors++;
}
if(!((((data41 === "left") || (data41 === "right")) || (data41 === "top")) || (data41 === "bottom"))){
const err109 = {instancePath:instancePath+"/side",schemaPath:"#/definitions/Side/enum",keyword:"enum",params:{allowedValues: schema46.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err109];
}
else {
vErrors.push(err109);
}
errors++;
}
var valid22 = _errs134 === errors;
}
else {
var valid22 = true;
}
if(valid22){
if(data.target !== undefined){
const _errs137 = errors;
if(typeof data.target !== "string"){
const err110 = {instancePath:instancePath+"/target",schemaPath:"#/oneOf/11/properties/target/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err110];
}
else {
vErrors.push(err110);
}
errors++;
}
var valid22 = _errs137 === errors;
}
else {
var valid22 = true;
}
}
}
}
}
}
}
else {
const err111 = {instancePath,schemaPath:"#/oneOf/11/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err111];
}
else {
vErrors.push(err111);
}
errors++;
}
}
var _valid0 = _errs127 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 11];
}
else {
if(_valid0){
valid0 = true;
passing0 = 11;
}
const _errs139 = errors;
if(errors === _errs139){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing16;
if(((((data.operation === undefined) && (missing16 = "operation")) || ((data.id === undefined) && (missing16 = "id"))) || ((data.target === undefined) && (missing16 = "target"))) || ((data.before === undefined) && (missing16 = "before"))){
const err112 = {instancePath,schemaPath:"#/oneOf/12/required",keyword:"required",params:{missingProperty: missing16},message:"must have required property '"+missing16+"'"};
if(vErrors === null){
vErrors = [err112];
}
else {
vErrors.push(err112);
}
errors++;
}
else {
const _errs141 = errors;
for(const key16 in data){
if(!((((key16 === "before") || (key16 === "id")) || (key16 === "operation")) || (key16 === "target"))){
const err113 = {instancePath,schemaPath:"#/oneOf/12/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key16},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err113];
}
else {
vErrors.push(err113);
}
errors++;
break;
}
}
if(_errs141 === errors){
if(data.before !== undefined){
const _errs142 = errors;
if(typeof data.before !== "boolean"){
const err114 = {instancePath:instancePath+"/before",schemaPath:"#/oneOf/12/properties/before/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err114];
}
else {
vErrors.push(err114);
}
errors++;
}
var valid24 = _errs142 === errors;
}
else {
var valid24 = true;
}
if(valid24){
if(data.id !== undefined){
const _errs144 = errors;
if(typeof data.id !== "string"){
const err115 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/12/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err115];
}
else {
vErrors.push(err115);
}
errors++;
}
var valid24 = _errs144 === errors;
}
else {
var valid24 = true;
}
if(valid24){
if(data.operation !== undefined){
let data45 = data.operation;
const _errs146 = errors;
if(typeof data45 !== "string"){
const err116 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/12/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err116];
}
else {
vErrors.push(err116);
}
errors++;
}
if("move-voyage" !== data45){
const err117 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/12/properties/operation/const",keyword:"const",params:{allowedValue: "move-voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err117];
}
else {
vErrors.push(err117);
}
errors++;
}
var valid24 = _errs146 === errors;
}
else {
var valid24 = true;
}
if(valid24){
if(data.target !== undefined){
const _errs148 = errors;
if(typeof data.target !== "string"){
const err118 = {instancePath:instancePath+"/target",schemaPath:"#/oneOf/12/properties/target/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err118];
}
else {
vErrors.push(err118);
}
errors++;
}
var valid24 = _errs148 === errors;
}
else {
var valid24 = true;
}
}
}
}
}
}
}
else {
const err119 = {instancePath,schemaPath:"#/oneOf/12/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err119];
}
else {
vErrors.push(err119);
}
errors++;
}
}
var _valid0 = _errs139 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 12];
}
else {
if(_valid0){
valid0 = true;
passing0 = 12;
}
const _errs150 = errors;
if(errors === _errs150){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing17;
if(((((data.operation === undefined) && (missing17 = "operation")) || ((data.id === undefined) && (missing17 = "id"))) || ((data.target === undefined) && (missing17 = "target"))) || ((data.before === undefined) && (missing17 = "before"))){
const err120 = {instancePath,schemaPath:"#/oneOf/13/required",keyword:"required",params:{missingProperty: missing17},message:"must have required property '"+missing17+"'"};
if(vErrors === null){
vErrors = [err120];
}
else {
vErrors.push(err120);
}
errors++;
}
else {
const _errs152 = errors;
for(const key17 in data){
if(!((((key17 === "before") || (key17 === "id")) || (key17 === "operation")) || (key17 === "target"))){
const err121 = {instancePath,schemaPath:"#/oneOf/13/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key17},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err121];
}
else {
vErrors.push(err121);
}
errors++;
break;
}
}
if(_errs152 === errors){
if(data.before !== undefined){
const _errs153 = errors;
if(typeof data.before !== "boolean"){
const err122 = {instancePath:instancePath+"/before",schemaPath:"#/oneOf/13/properties/before/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err122];
}
else {
vErrors.push(err122);
}
errors++;
}
var valid25 = _errs153 === errors;
}
else {
var valid25 = true;
}
if(valid25){
if(data.id !== undefined){
const _errs155 = errors;
if(typeof data.id !== "string"){
const err123 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/13/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err123];
}
else {
vErrors.push(err123);
}
errors++;
}
var valid25 = _errs155 === errors;
}
else {
var valid25 = true;
}
if(valid25){
if(data.operation !== undefined){
let data49 = data.operation;
const _errs157 = errors;
if(typeof data49 !== "string"){
const err124 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/13/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err124];
}
else {
vErrors.push(err124);
}
errors++;
}
if("move-fleet" !== data49){
const err125 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/13/properties/operation/const",keyword:"const",params:{allowedValue: "move-fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err125];
}
else {
vErrors.push(err125);
}
errors++;
}
var valid25 = _errs157 === errors;
}
else {
var valid25 = true;
}
if(valid25){
if(data.target !== undefined){
const _errs159 = errors;
if(typeof data.target !== "string"){
const err126 = {instancePath:instancePath+"/target",schemaPath:"#/oneOf/13/properties/target/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err126];
}
else {
vErrors.push(err126);
}
errors++;
}
var valid25 = _errs159 === errors;
}
else {
var valid25 = true;
}
}
}
}
}
}
}
else {
const err127 = {instancePath,schemaPath:"#/oneOf/13/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err127];
}
else {
vErrors.push(err127);
}
errors++;
}
}
var _valid0 = _errs150 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 13];
}
else {
if(_valid0){
valid0 = true;
passing0 = 13;
}
const _errs161 = errors;
if(errors === _errs161){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing18;
if(((data.operation === undefined) && (missing18 = "operation")) || ((data.id === undefined) && (missing18 = "id"))){
const err128 = {instancePath,schemaPath:"#/oneOf/14/required",keyword:"required",params:{missingProperty: missing18},message:"must have required property '"+missing18+"'"};
if(vErrors === null){
vErrors = [err128];
}
else {
vErrors.push(err128);
}
errors++;
}
else {
const _errs163 = errors;
for(const key18 in data){
if(!((key18 === "id") || (key18 === "operation"))){
const err129 = {instancePath,schemaPath:"#/oneOf/14/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key18},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err129];
}
else {
vErrors.push(err129);
}
errors++;
break;
}
}
if(_errs163 === errors){
if(data.id !== undefined){
const _errs164 = errors;
if(typeof data.id !== "string"){
const err130 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/14/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err130];
}
else {
vErrors.push(err130);
}
errors++;
}
var valid26 = _errs164 === errors;
}
else {
var valid26 = true;
}
if(valid26){
if(data.operation !== undefined){
let data52 = data.operation;
const _errs166 = errors;
if(typeof data52 !== "string"){
const err131 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/14/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err131];
}
else {
vErrors.push(err131);
}
errors++;
}
if("select-voyage" !== data52){
const err132 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/14/properties/operation/const",keyword:"const",params:{allowedValue: "select-voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err132];
}
else {
vErrors.push(err132);
}
errors++;
}
var valid26 = _errs166 === errors;
}
else {
var valid26 = true;
}
}
}
}
}
else {
const err133 = {instancePath,schemaPath:"#/oneOf/14/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err133];
}
else {
vErrors.push(err133);
}
errors++;
}
}
var _valid0 = _errs161 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 14];
}
else {
if(_valid0){
valid0 = true;
passing0 = 14;
}
const _errs168 = errors;
if(errors === _errs168){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing19;
if(((data.operation === undefined) && (missing19 = "operation")) || ((data.id === undefined) && (missing19 = "id"))){
const err134 = {instancePath,schemaPath:"#/oneOf/15/required",keyword:"required",params:{missingProperty: missing19},message:"must have required property '"+missing19+"'"};
if(vErrors === null){
vErrors = [err134];
}
else {
vErrors.push(err134);
}
errors++;
}
else {
const _errs170 = errors;
for(const key19 in data){
if(!((key19 === "id") || (key19 === "operation"))){
const err135 = {instancePath,schemaPath:"#/oneOf/15/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key19},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err135];
}
else {
vErrors.push(err135);
}
errors++;
break;
}
}
if(_errs170 === errors){
if(data.id !== undefined){
const _errs171 = errors;
if(typeof data.id !== "string"){
const err136 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/15/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err136];
}
else {
vErrors.push(err136);
}
errors++;
}
var valid27 = _errs171 === errors;
}
else {
var valid27 = true;
}
if(valid27){
if(data.operation !== undefined){
let data54 = data.operation;
const _errs173 = errors;
if(typeof data54 !== "string"){
const err137 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/15/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err137];
}
else {
vErrors.push(err137);
}
errors++;
}
if("select-fleet" !== data54){
const err138 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/15/properties/operation/const",keyword:"const",params:{allowedValue: "select-fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err138];
}
else {
vErrors.push(err138);
}
errors++;
}
var valid27 = _errs173 === errors;
}
else {
var valid27 = true;
}
}
}
}
}
else {
const err139 = {instancePath,schemaPath:"#/oneOf/15/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err139];
}
else {
vErrors.push(err139);
}
errors++;
}
}
var _valid0 = _errs168 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 15];
}
else {
if(_valid0){
valid0 = true;
passing0 = 15;
}
const _errs175 = errors;
if(errors === _errs175){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing20;
if(((data.operation === undefined) && (missing20 = "operation")) || ((data.id === undefined) && (missing20 = "id"))){
const err140 = {instancePath,schemaPath:"#/oneOf/16/required",keyword:"required",params:{missingProperty: missing20},message:"must have required property '"+missing20+"'"};
if(vErrors === null){
vErrors = [err140];
}
else {
vErrors.push(err140);
}
errors++;
}
else {
const _errs177 = errors;
for(const key20 in data){
if(!((key20 === "id") || (key20 === "operation"))){
const err141 = {instancePath,schemaPath:"#/oneOf/16/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key20},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err141];
}
else {
vErrors.push(err141);
}
errors++;
break;
}
}
if(_errs177 === errors){
if(data.id !== undefined){
const _errs178 = errors;
if(typeof data.id !== "string"){
const err142 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/16/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err142];
}
else {
vErrors.push(err142);
}
errors++;
}
var valid28 = _errs178 === errors;
}
else {
var valid28 = true;
}
if(valid28){
if(data.operation !== undefined){
let data56 = data.operation;
const _errs180 = errors;
if(typeof data56 !== "string"){
const err143 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/16/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err143];
}
else {
vErrors.push(err143);
}
errors++;
}
if("reveal-vessel" !== data56){
const err144 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/16/properties/operation/const",keyword:"const",params:{allowedValue: "reveal-vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err144];
}
else {
vErrors.push(err144);
}
errors++;
}
var valid28 = _errs180 === errors;
}
else {
var valid28 = true;
}
}
}
}
}
else {
const err145 = {instancePath,schemaPath:"#/oneOf/16/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err145];
}
else {
vErrors.push(err145);
}
errors++;
}
}
var _valid0 = _errs175 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 16];
}
else {
if(_valid0){
valid0 = true;
passing0 = 16;
}
const _errs182 = errors;
if(errors === _errs182){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing21;
if(((data.operation === undefined) && (missing21 = "operation")) || ((data.context === undefined) && (missing21 = "context"))){
const err146 = {instancePath,schemaPath:"#/oneOf/17/required",keyword:"required",params:{missingProperty: missing21},message:"must have required property '"+missing21+"'"};
if(vErrors === null){
vErrors = [err146];
}
else {
vErrors.push(err146);
}
errors++;
}
else {
const _errs184 = errors;
for(const key21 in data){
if(!((key21 === "context") || (key21 === "operation"))){
const err147 = {instancePath,schemaPath:"#/oneOf/17/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key21},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err147];
}
else {
vErrors.push(err147);
}
errors++;
break;
}
}
if(_errs184 === errors){
if(data.context !== undefined){
let data57 = data.context;
const _errs185 = errors;
const _errs187 = errors;
let valid31 = false;
let passing2 = null;
const _errs188 = errors;
if(errors === _errs188){
if(data57 && typeof data57 == "object" && !Array.isArray(data57)){
let missing22;
if((data57.kind === undefined) && (missing22 = "kind")){
const err148 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/0/required",keyword:"required",params:{missingProperty: missing22},message:"must have required property '"+missing22+"'"};
if(vErrors === null){
vErrors = [err148];
}
else {
vErrors.push(err148);
}
errors++;
}
else {
const _errs190 = errors;
for(const key22 in data57){
if(!(key22 === "kind")){
const err149 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key22},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err149];
}
else {
vErrors.push(err149);
}
errors++;
break;
}
}
if(_errs190 === errors){
if(data57.kind !== undefined){
let data58 = data57.kind;
if(typeof data58 !== "string"){
const err150 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err150];
}
else {
vErrors.push(err150);
}
errors++;
}
if("workspace" !== data58){
const err151 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "workspace"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err151];
}
else {
vErrors.push(err151);
}
errors++;
}
}
}
}
}
else {
const err152 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err152];
}
else {
vErrors.push(err152);
}
errors++;
}
}
var _valid2 = _errs188 === errors;
if(_valid2){
valid31 = true;
passing2 = 0;
}
const _errs193 = errors;
if(errors === _errs193){
if(data57 && typeof data57 == "object" && !Array.isArray(data57)){
let missing23;
if(((data57.kind === undefined) && (missing23 = "kind")) || ((data57.id === undefined) && (missing23 = "id"))){
const err153 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/1/required",keyword:"required",params:{missingProperty: missing23},message:"must have required property '"+missing23+"'"};
if(vErrors === null){
vErrors = [err153];
}
else {
vErrors.push(err153);
}
errors++;
}
else {
const _errs195 = errors;
for(const key23 in data57){
if(!((key23 === "id") || (key23 === "kind"))){
const err154 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key23},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err154];
}
else {
vErrors.push(err154);
}
errors++;
break;
}
}
if(_errs195 === errors){
if(data57.id !== undefined){
const _errs196 = errors;
if(typeof data57.id !== "string"){
const err155 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/1/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err155];
}
else {
vErrors.push(err155);
}
errors++;
}
var valid33 = _errs196 === errors;
}
else {
var valid33 = true;
}
if(valid33){
if(data57.kind !== undefined){
let data60 = data57.kind;
const _errs198 = errors;
if(typeof data60 !== "string"){
const err156 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err156];
}
else {
vErrors.push(err156);
}
errors++;
}
if("voyage" !== data60){
const err157 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err157];
}
else {
vErrors.push(err157);
}
errors++;
}
var valid33 = _errs198 === errors;
}
else {
var valid33 = true;
}
}
}
}
}
else {
const err158 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err158];
}
else {
vErrors.push(err158);
}
errors++;
}
}
var _valid2 = _errs193 === errors;
if(_valid2 && valid31){
valid31 = false;
passing2 = [passing2, 1];
}
else {
if(_valid2){
valid31 = true;
passing2 = 1;
}
const _errs200 = errors;
if(errors === _errs200){
if(data57 && typeof data57 == "object" && !Array.isArray(data57)){
let missing24;
if(((data57.kind === undefined) && (missing24 = "kind")) || ((data57.id === undefined) && (missing24 = "id"))){
const err159 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/2/required",keyword:"required",params:{missingProperty: missing24},message:"must have required property '"+missing24+"'"};
if(vErrors === null){
vErrors = [err159];
}
else {
vErrors.push(err159);
}
errors++;
}
else {
const _errs202 = errors;
for(const key24 in data57){
if(!((key24 === "id") || (key24 === "kind"))){
const err160 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key24},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err160];
}
else {
vErrors.push(err160);
}
errors++;
break;
}
}
if(_errs202 === errors){
if(data57.id !== undefined){
const _errs203 = errors;
if(typeof data57.id !== "string"){
const err161 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/2/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err161];
}
else {
vErrors.push(err161);
}
errors++;
}
var valid34 = _errs203 === errors;
}
else {
var valid34 = true;
}
if(valid34){
if(data57.kind !== undefined){
let data62 = data57.kind;
const _errs205 = errors;
if(typeof data62 !== "string"){
const err162 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err162];
}
else {
vErrors.push(err162);
}
errors++;
}
if("fleet" !== data62){
const err163 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err163];
}
else {
vErrors.push(err163);
}
errors++;
}
var valid34 = _errs205 === errors;
}
else {
var valid34 = true;
}
}
}
}
}
else {
const err164 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err164];
}
else {
vErrors.push(err164);
}
errors++;
}
}
var _valid2 = _errs200 === errors;
if(_valid2 && valid31){
valid31 = false;
passing2 = [passing2, 2];
}
else {
if(_valid2){
valid31 = true;
passing2 = 2;
}
const _errs207 = errors;
if(errors === _errs207){
if(data57 && typeof data57 == "object" && !Array.isArray(data57)){
let missing25;
if(((data57.kind === undefined) && (missing25 = "kind")) || ((data57.id === undefined) && (missing25 = "id"))){
const err165 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/3/required",keyword:"required",params:{missingProperty: missing25},message:"must have required property '"+missing25+"'"};
if(vErrors === null){
vErrors = [err165];
}
else {
vErrors.push(err165);
}
errors++;
}
else {
const _errs209 = errors;
for(const key25 in data57){
if(!((key25 === "id") || (key25 === "kind"))){
const err166 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key25},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err166];
}
else {
vErrors.push(err166);
}
errors++;
break;
}
}
if(_errs209 === errors){
if(data57.id !== undefined){
const _errs210 = errors;
if(typeof data57.id !== "string"){
const err167 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/3/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err167];
}
else {
vErrors.push(err167);
}
errors++;
}
var valid35 = _errs210 === errors;
}
else {
var valid35 = true;
}
if(valid35){
if(data57.kind !== undefined){
let data64 = data57.kind;
const _errs212 = errors;
if(typeof data64 !== "string"){
const err168 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/3/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err168];
}
else {
vErrors.push(err168);
}
errors++;
}
if("vessel" !== data64){
const err169 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/3/properties/kind/const",keyword:"const",params:{allowedValue: "vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err169];
}
else {
vErrors.push(err169);
}
errors++;
}
var valid35 = _errs212 === errors;
}
else {
var valid35 = true;
}
}
}
}
}
else {
const err170 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err170];
}
else {
vErrors.push(err170);
}
errors++;
}
}
var _valid2 = _errs207 === errors;
if(_valid2 && valid31){
valid31 = false;
passing2 = [passing2, 3];
}
else {
if(_valid2){
valid31 = true;
passing2 = 3;
}
const _errs214 = errors;
if(errors === _errs214){
if(data57 && typeof data57 == "object" && !Array.isArray(data57)){
let missing26;
if(((data57.kind === undefined) && (missing26 = "kind")) || ((data57.id === undefined) && (missing26 = "id"))){
const err171 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/4/required",keyword:"required",params:{missingProperty: missing26},message:"must have required property '"+missing26+"'"};
if(vErrors === null){
vErrors = [err171];
}
else {
vErrors.push(err171);
}
errors++;
}
else {
const _errs216 = errors;
for(const key26 in data57){
if(!((key26 === "id") || (key26 === "kind"))){
const err172 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key26},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err172];
}
else {
vErrors.push(err172);
}
errors++;
break;
}
}
if(_errs216 === errors){
if(data57.id !== undefined){
const _errs217 = errors;
if(typeof data57.id !== "string"){
const err173 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/4/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err173];
}
else {
vErrors.push(err173);
}
errors++;
}
var valid36 = _errs217 === errors;
}
else {
var valid36 = true;
}
if(valid36){
if(data57.kind !== undefined){
let data66 = data57.kind;
const _errs219 = errors;
if(typeof data66 !== "string"){
const err174 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/4/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err174];
}
else {
vErrors.push(err174);
}
errors++;
}
if("portal" !== data66){
const err175 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/4/properties/kind/const",keyword:"const",params:{allowedValue: "portal"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err175];
}
else {
vErrors.push(err175);
}
errors++;
}
var valid36 = _errs219 === errors;
}
else {
var valid36 = true;
}
}
}
}
}
else {
const err176 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err176];
}
else {
vErrors.push(err176);
}
errors++;
}
}
var _valid2 = _errs214 === errors;
if(_valid2 && valid31){
valid31 = false;
passing2 = [passing2, 4];
}
else {
if(_valid2){
valid31 = true;
passing2 = 4;
}
}
}
}
}
if(!valid31){
const err177 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf",keyword:"oneOf",params:{passingSchemas: passing2},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err177];
}
else {
vErrors.push(err177);
}
errors++;
}
else {
errors = _errs187;
if(vErrors !== null){
if(_errs187){
vErrors.length = _errs187;
}
else {
vErrors = null;
}
}
}
var valid29 = _errs185 === errors;
}
else {
var valid29 = true;
}
if(valid29){
if(data.operation !== undefined){
let data67 = data.operation;
const _errs221 = errors;
if(typeof data67 !== "string"){
const err178 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/17/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err178];
}
else {
vErrors.push(err178);
}
errors++;
}
if("dock" !== data67){
const err179 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/17/properties/operation/const",keyword:"const",params:{allowedValue: "dock"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err179];
}
else {
vErrors.push(err179);
}
errors++;
}
var valid29 = _errs221 === errors;
}
else {
var valid29 = true;
}
}
}
}
}
else {
const err180 = {instancePath,schemaPath:"#/oneOf/17/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err180];
}
else {
vErrors.push(err180);
}
errors++;
}
}
var _valid0 = _errs182 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 17];
}
else {
if(_valid0){
valid0 = true;
passing0 = 17;
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
if(!valid0){
const err181 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err181];
}
else {
vErrors.push(err181);
}
errors++;
validate26.errors = vErrors;
return false;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate26.errors = vErrors;
return errors === 0;
}


function validate25(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(errors === _errs1){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((data.tool === undefined) && (missing0 = "tool")) || ((data.action === undefined) && (missing0 = "action"))){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
else {
const _errs3 = errors;
for(const key0 in data){
if(!((key0 === "action") || (key0 === "tool"))){
const err1 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
break;
}
}
if(_errs3 === errors){
if(data.action !== undefined){
const _errs4 = errors;
if(!(validate26(data.action, {instancePath:instancePath+"/action",parentData:data,parentDataProperty:"action",rootData}))){
vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
errors = vErrors.length;
}
var valid1 = _errs4 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.tool !== undefined){
let data1 = data.tool;
const _errs5 = errors;
if(typeof data1 !== "string"){
const err2 = {instancePath:instancePath+"/tool",schemaPath:"#/oneOf/0/properties/tool/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if("workspace" !== data1){
const err3 = {instancePath:instancePath+"/tool",schemaPath:"#/oneOf/0/properties/tool/const",keyword:"const",params:{allowedValue: "workspace"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
var valid1 = _errs5 === errors;
}
else {
var valid1 = true;
}
}
}
}
}
else {
const err4 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
}
const _errs7 = errors;
if(errors === _errs7){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing1;
if(((data.tool === undefined) && (missing1 = "tool")) || ((data.action === undefined) && (missing1 = "action"))){
const err5 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
else {
const _errs9 = errors;
for(const key1 in data){
if(!((key1 === "action") || (key1 === "tool"))){
const err6 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
break;
}
}
if(_errs9 === errors){
if(data.action !== undefined){
let data2 = data.action;
const _errs10 = errors;
const _errs12 = errors;
let valid4 = false;
let passing1 = null;
const _errs13 = errors;
if(errors === _errs13){
if(data2 && typeof data2 == "object" && !Array.isArray(data2)){
let missing2;
if((data2.operation === undefined) && (missing2 = "operation")){
const err7 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf/0/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
else {
const _errs15 = errors;
for(const key2 in data2){
if(!(key2 === "operation")){
const err8 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
break;
}
}
if(_errs15 === errors){
if(data2.operation !== undefined){
let data3 = data2.operation;
if(typeof data3 !== "string"){
const err9 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/ProcessAction/oneOf/0/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if("list" !== data3){
const err10 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/ProcessAction/oneOf/0/properties/operation/const",keyword:"const",params:{allowedValue: "list"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
}
}
else {
const err11 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
var _valid1 = _errs13 === errors;
if(_valid1){
valid4 = true;
passing1 = 0;
}
const _errs18 = errors;
if(errors === _errs18){
if(data2 && typeof data2 == "object" && !Array.isArray(data2)){
let missing3;
if(((((data2.operation === undefined) && (missing3 = "operation")) || ((data2.contentId === undefined) && (missing3 = "contentId"))) || ((data2.terminalId === undefined) && (missing3 = "terminalId"))) || ((data2.lines === undefined) && (missing3 = "lines"))){
const err12 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf/1/required",keyword:"required",params:{missingProperty: missing3},message:"must have required property '"+missing3+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
else {
const _errs20 = errors;
for(const key3 in data2){
if(!((((key3 === "contentId") || (key3 === "lines")) || (key3 === "operation")) || (key3 === "terminalId"))){
const err13 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
break;
}
}
if(_errs20 === errors){
if(data2.contentId !== undefined){
const _errs21 = errors;
if(typeof data2.contentId !== "string"){
const err14 = {instancePath:instancePath+"/action/contentId",schemaPath:"#/definitions/ProcessAction/oneOf/1/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
var valid6 = _errs21 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data2.lines !== undefined){
let data5 = data2.lines;
const _errs23 = errors;
if(!(((typeof data5 == "number") && (!(data5 % 1) && !isNaN(data5))) && (isFinite(data5)))){
const err15 = {instancePath:instancePath+"/action/lines",schemaPath:"#/definitions/ProcessAction/oneOf/1/properties/lines/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(errors === _errs23){
if((typeof data5 == "number") && (isFinite(data5))){
if(data5 > 160 || isNaN(data5)){
const err16 = {instancePath:instancePath+"/action/lines",schemaPath:"#/definitions/ProcessAction/oneOf/1/properties/lines/maximum",keyword:"maximum",params:{comparison: "<=", limit: 160},message:"must be <= 160"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
else {
if(data5 < 0 || isNaN(data5)){
const err17 = {instancePath:instancePath+"/action/lines",schemaPath:"#/definitions/ProcessAction/oneOf/1/properties/lines/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
}
}
var valid6 = _errs23 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data2.operation !== undefined){
let data6 = data2.operation;
const _errs25 = errors;
if(typeof data6 !== "string"){
const err18 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/ProcessAction/oneOf/1/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if("read" !== data6){
const err19 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/ProcessAction/oneOf/1/properties/operation/const",keyword:"const",params:{allowedValue: "read"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
var valid6 = _errs25 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data2.terminalId !== undefined){
const _errs27 = errors;
if(typeof data2.terminalId !== "string"){
const err20 = {instancePath:instancePath+"/action/terminalId",schemaPath:"#/definitions/ProcessAction/oneOf/1/properties/terminalId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
var valid6 = _errs27 === errors;
}
else {
var valid6 = true;
}
}
}
}
}
}
}
else {
const err21 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
var _valid1 = _errs18 === errors;
if(_valid1 && valid4){
valid4 = false;
passing1 = [passing1, 1];
}
else {
if(_valid1){
valid4 = true;
passing1 = 1;
}
const _errs29 = errors;
if(errors === _errs29){
if(data2 && typeof data2 == "object" && !Array.isArray(data2)){
let missing4;
if((((((data2.operation === undefined) && (missing4 = "operation")) || ((data2.contentId === undefined) && (missing4 = "contentId"))) || ((data2.terminalId === undefined) && (missing4 = "terminalId"))) || ((data2.pid === undefined) && (missing4 = "pid"))) || ((data2.text === undefined) && (missing4 = "text"))){
const err22 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf/2/required",keyword:"required",params:{missingProperty: missing4},message:"must have required property '"+missing4+"'"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
else {
const _errs31 = errors;
for(const key4 in data2){
if(!(((((key4 === "contentId") || (key4 === "operation")) || (key4 === "pid")) || (key4 === "terminalId")) || (key4 === "text"))){
const err23 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
break;
}
}
if(_errs31 === errors){
if(data2.contentId !== undefined){
const _errs32 = errors;
if(typeof data2.contentId !== "string"){
const err24 = {instancePath:instancePath+"/action/contentId",schemaPath:"#/definitions/ProcessAction/oneOf/2/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
var valid7 = _errs32 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data2.operation !== undefined){
let data9 = data2.operation;
const _errs34 = errors;
if(typeof data9 !== "string"){
const err25 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/ProcessAction/oneOf/2/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if("send" !== data9){
const err26 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/ProcessAction/oneOf/2/properties/operation/const",keyword:"const",params:{allowedValue: "send"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
var valid7 = _errs34 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data2.pid !== undefined){
let data10 = data2.pid;
const _errs36 = errors;
if(!(((typeof data10 == "number") && (!(data10 % 1) && !isNaN(data10))) && (isFinite(data10)))){
const err27 = {instancePath:instancePath+"/action/pid",schemaPath:"#/definitions/ProcessAction/oneOf/2/properties/pid/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
if(errors === _errs36){
if((typeof data10 == "number") && (isFinite(data10))){
if(data10 > 4294967295 || isNaN(data10)){
const err28 = {instancePath:instancePath+"/action/pid",schemaPath:"#/definitions/ProcessAction/oneOf/2/properties/pid/maximum",keyword:"maximum",params:{comparison: "<=", limit: 4294967295},message:"must be <= 4294967295"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
else {
if(data10 < 0 || isNaN(data10)){
const err29 = {instancePath:instancePath+"/action/pid",schemaPath:"#/definitions/ProcessAction/oneOf/2/properties/pid/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
}
}
var valid7 = _errs36 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data2.terminalId !== undefined){
const _errs38 = errors;
if(typeof data2.terminalId !== "string"){
const err30 = {instancePath:instancePath+"/action/terminalId",schemaPath:"#/definitions/ProcessAction/oneOf/2/properties/terminalId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
var valid7 = _errs38 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data2.text !== undefined){
const _errs40 = errors;
if(typeof data2.text !== "string"){
const err31 = {instancePath:instancePath+"/action/text",schemaPath:"#/definitions/ProcessAction/oneOf/2/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
var valid7 = _errs40 === errors;
}
else {
var valid7 = true;
}
}
}
}
}
}
}
}
else {
const err32 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
var _valid1 = _errs29 === errors;
if(_valid1 && valid4){
valid4 = false;
passing1 = [passing1, 2];
}
else {
if(_valid1){
valid4 = true;
passing1 = 2;
}
const _errs42 = errors;
if(errors === _errs42){
if(data2 && typeof data2 == "object" && !Array.isArray(data2)){
let missing5;
if(((((data2.operation === undefined) && (missing5 = "operation")) || ((data2.contentId === undefined) && (missing5 = "contentId"))) || ((data2.terminalId === undefined) && (missing5 = "terminalId"))) || ((data2.pid === undefined) && (missing5 = "pid"))){
const err33 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf/3/required",keyword:"required",params:{missingProperty: missing5},message:"must have required property '"+missing5+"'"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
else {
const _errs44 = errors;
for(const key5 in data2){
if(!((((key5 === "contentId") || (key5 === "operation")) || (key5 === "pid")) || (key5 === "terminalId"))){
const err34 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
break;
}
}
if(_errs44 === errors){
if(data2.contentId !== undefined){
const _errs45 = errors;
if(typeof data2.contentId !== "string"){
const err35 = {instancePath:instancePath+"/action/contentId",schemaPath:"#/definitions/ProcessAction/oneOf/3/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
var valid8 = _errs45 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data2.operation !== undefined){
let data14 = data2.operation;
const _errs47 = errors;
if(typeof data14 !== "string"){
const err36 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/ProcessAction/oneOf/3/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
if("interrupt" !== data14){
const err37 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/ProcessAction/oneOf/3/properties/operation/const",keyword:"const",params:{allowedValue: "interrupt"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
var valid8 = _errs47 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data2.pid !== undefined){
let data15 = data2.pid;
const _errs49 = errors;
if(!(((typeof data15 == "number") && (!(data15 % 1) && !isNaN(data15))) && (isFinite(data15)))){
const err38 = {instancePath:instancePath+"/action/pid",schemaPath:"#/definitions/ProcessAction/oneOf/3/properties/pid/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
if(errors === _errs49){
if((typeof data15 == "number") && (isFinite(data15))){
if(data15 > 4294967295 || isNaN(data15)){
const err39 = {instancePath:instancePath+"/action/pid",schemaPath:"#/definitions/ProcessAction/oneOf/3/properties/pid/maximum",keyword:"maximum",params:{comparison: "<=", limit: 4294967295},message:"must be <= 4294967295"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
else {
if(data15 < 0 || isNaN(data15)){
const err40 = {instancePath:instancePath+"/action/pid",schemaPath:"#/definitions/ProcessAction/oneOf/3/properties/pid/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
}
}
var valid8 = _errs49 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data2.terminalId !== undefined){
const _errs51 = errors;
if(typeof data2.terminalId !== "string"){
const err41 = {instancePath:instancePath+"/action/terminalId",schemaPath:"#/definitions/ProcessAction/oneOf/3/properties/terminalId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
var valid8 = _errs51 === errors;
}
else {
var valid8 = true;
}
}
}
}
}
}
}
else {
const err42 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
var _valid1 = _errs42 === errors;
if(_valid1 && valid4){
valid4 = false;
passing1 = [passing1, 3];
}
else {
if(_valid1){
valid4 = true;
passing1 = 3;
}
const _errs53 = errors;
if(errors === _errs53){
if(data2 && typeof data2 == "object" && !Array.isArray(data2)){
let missing6;
if(((((data2.operation === undefined) && (missing6 = "operation")) || ((data2.contentId === undefined) && (missing6 = "contentId"))) || ((data2.terminalId === undefined) && (missing6 = "terminalId"))) || ((data2.pid === undefined) && (missing6 = "pid"))){
const err43 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf/4/required",keyword:"required",params:{missingProperty: missing6},message:"must have required property '"+missing6+"'"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
else {
const _errs55 = errors;
for(const key6 in data2){
if(!((((key6 === "contentId") || (key6 === "operation")) || (key6 === "pid")) || (key6 === "terminalId"))){
const err44 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
break;
}
}
if(_errs55 === errors){
if(data2.contentId !== undefined){
const _errs56 = errors;
if(typeof data2.contentId !== "string"){
const err45 = {instancePath:instancePath+"/action/contentId",schemaPath:"#/definitions/ProcessAction/oneOf/4/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
var valid9 = _errs56 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data2.operation !== undefined){
let data18 = data2.operation;
const _errs58 = errors;
if(typeof data18 !== "string"){
const err46 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/ProcessAction/oneOf/4/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
if("stop" !== data18){
const err47 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/ProcessAction/oneOf/4/properties/operation/const",keyword:"const",params:{allowedValue: "stop"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
var valid9 = _errs58 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data2.pid !== undefined){
let data19 = data2.pid;
const _errs60 = errors;
if(!(((typeof data19 == "number") && (!(data19 % 1) && !isNaN(data19))) && (isFinite(data19)))){
const err48 = {instancePath:instancePath+"/action/pid",schemaPath:"#/definitions/ProcessAction/oneOf/4/properties/pid/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
if(errors === _errs60){
if((typeof data19 == "number") && (isFinite(data19))){
if(data19 > 4294967295 || isNaN(data19)){
const err49 = {instancePath:instancePath+"/action/pid",schemaPath:"#/definitions/ProcessAction/oneOf/4/properties/pid/maximum",keyword:"maximum",params:{comparison: "<=", limit: 4294967295},message:"must be <= 4294967295"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
else {
if(data19 < 0 || isNaN(data19)){
const err50 = {instancePath:instancePath+"/action/pid",schemaPath:"#/definitions/ProcessAction/oneOf/4/properties/pid/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
}
}
var valid9 = _errs60 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data2.terminalId !== undefined){
const _errs62 = errors;
if(typeof data2.terminalId !== "string"){
const err51 = {instancePath:instancePath+"/action/terminalId",schemaPath:"#/definitions/ProcessAction/oneOf/4/properties/terminalId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
var valid9 = _errs62 === errors;
}
else {
var valid9 = true;
}
}
}
}
}
}
}
else {
const err52 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
}
var _valid1 = _errs53 === errors;
if(_valid1 && valid4){
valid4 = false;
passing1 = [passing1, 4];
}
else {
if(_valid1){
valid4 = true;
passing1 = 4;
}
}
}
}
}
if(!valid4){
const err53 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf",keyword:"oneOf",params:{passingSchemas: passing1},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
else {
errors = _errs12;
if(vErrors !== null){
if(_errs12){
vErrors.length = _errs12;
}
else {
vErrors = null;
}
}
}
var valid2 = _errs10 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data.tool !== undefined){
let data21 = data.tool;
const _errs64 = errors;
if(typeof data21 !== "string"){
const err54 = {instancePath:instancePath+"/tool",schemaPath:"#/oneOf/1/properties/tool/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
if("process" !== data21){
const err55 = {instancePath:instancePath+"/tool",schemaPath:"#/oneOf/1/properties/tool/const",keyword:"const",params:{allowedValue: "process"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
var valid2 = _errs64 === errors;
}
else {
var valid2 = true;
}
}
}
}
}
else {
const err56 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
}
var _valid0 = _errs7 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
}
const _errs66 = errors;
if(errors === _errs66){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing7;
if(((data.tool === undefined) && (missing7 = "tool")) || ((data.action === undefined) && (missing7 = "action"))){
const err57 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: missing7},message:"must have required property '"+missing7+"'"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
else {
const _errs68 = errors;
for(const key7 in data){
if(!((key7 === "action") || (key7 === "tool"))){
const err58 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key7},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
break;
}
}
if(_errs68 === errors){
if(data.action !== undefined){
let data22 = data.action;
const _errs69 = errors;
const _errs71 = errors;
let valid12 = false;
let passing2 = null;
const _errs72 = errors;
if(errors === _errs72){
if(data22 && typeof data22 == "object" && !Array.isArray(data22)){
let missing8;
if(((data22.operation === undefined) && (missing8 = "operation")) || ((data22.contentId === undefined) && (missing8 = "contentId"))){
const err59 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/Receipt/oneOf/0/required",keyword:"required",params:{missingProperty: missing8},message:"must have required property '"+missing8+"'"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
else {
const _errs74 = errors;
for(const key8 in data22){
if(!((key8 === "contentId") || (key8 === "operation"))){
const err60 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/Receipt/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key8},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
break;
}
}
if(_errs74 === errors){
if(data22.contentId !== undefined){
const _errs75 = errors;
if(typeof data22.contentId !== "string"){
const err61 = {instancePath:instancePath+"/action/contentId",schemaPath:"#/definitions/Receipt/oneOf/0/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
var valid13 = _errs75 === errors;
}
else {
var valid13 = true;
}
if(valid13){
if(data22.operation !== undefined){
let data24 = data22.operation;
const _errs77 = errors;
if(typeof data24 !== "string"){
const err62 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/Receipt/oneOf/0/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
if("describe" !== data24){
const err63 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/Receipt/oneOf/0/properties/operation/const",keyword:"const",params:{allowedValue: "describe"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
var valid13 = _errs77 === errors;
}
else {
var valid13 = true;
}
}
}
}
}
else {
const err64 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/Receipt/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
}
var _valid2 = _errs72 === errors;
if(_valid2){
valid12 = true;
passing2 = 0;
}
const _errs79 = errors;
if(errors === _errs79){
if(data22 && typeof data22 == "object" && !Array.isArray(data22)){
let missing9;
if(((data22.operation === undefined) && (missing9 = "operation")) || ((data22.contentId === undefined) && (missing9 = "contentId"))){
const err65 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/Receipt/oneOf/1/required",keyword:"required",params:{missingProperty: missing9},message:"must have required property '"+missing9+"'"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
else {
const _errs81 = errors;
for(const key9 in data22){
if(!((key9 === "contentId") || (key9 === "operation"))){
const err66 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/Receipt/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key9},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
break;
}
}
if(_errs81 === errors){
if(data22.contentId !== undefined){
const _errs82 = errors;
if(typeof data22.contentId !== "string"){
const err67 = {instancePath:instancePath+"/action/contentId",schemaPath:"#/definitions/Receipt/oneOf/1/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
var valid14 = _errs82 === errors;
}
else {
var valid14 = true;
}
if(valid14){
if(data22.operation !== undefined){
let data26 = data22.operation;
const _errs84 = errors;
if(typeof data26 !== "string"){
const err68 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/Receipt/oneOf/1/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
if("inspect" !== data26){
const err69 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/Receipt/oneOf/1/properties/operation/const",keyword:"const",params:{allowedValue: "inspect"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
var valid14 = _errs84 === errors;
}
else {
var valid14 = true;
}
}
}
}
}
else {
const err70 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/Receipt/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
}
var _valid2 = _errs79 === errors;
if(_valid2 && valid12){
valid12 = false;
passing2 = [passing2, 1];
}
else {
if(_valid2){
valid12 = true;
passing2 = 1;
}
const _errs86 = errors;
if(errors === _errs86){
if(data22 && typeof data22 == "object" && !Array.isArray(data22)){
let missing10;
if((((data22.operation === undefined) && (missing10 = "operation")) || ((data22.contentId === undefined) && (missing10 = "contentId"))) || ((data22.expectedRevision === undefined) && (missing10 = "expectedRevision"))){
const err71 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/Receipt/oneOf/2/required",keyword:"required",params:{missingProperty: missing10},message:"must have required property '"+missing10+"'"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
else {
const _errs88 = errors;
for(const key10 in data22){
if(!(((key10 === "contentId") || (key10 === "expectedRevision")) || (key10 === "operation"))){
const err72 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/Receipt/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key10},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
break;
}
}
if(_errs88 === errors){
if(data22.contentId !== undefined){
const _errs89 = errors;
if(typeof data22.contentId !== "string"){
const err73 = {instancePath:instancePath+"/action/contentId",schemaPath:"#/definitions/Receipt/oneOf/2/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
var valid15 = _errs89 === errors;
}
else {
var valid15 = true;
}
if(valid15){
if(data22.expectedRevision !== undefined){
const _errs91 = errors;
if(typeof data22.expectedRevision !== "string"){
const err74 = {instancePath:instancePath+"/action/expectedRevision",schemaPath:"#/definitions/Receipt/oneOf/2/properties/expectedRevision/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
var valid15 = _errs91 === errors;
}
else {
var valid15 = true;
}
if(valid15){
if(data22.operation !== undefined){
let data29 = data22.operation;
const _errs93 = errors;
if(typeof data29 !== "string"){
const err75 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/Receipt/oneOf/2/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
if("update" !== data29){
const err76 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/Receipt/oneOf/2/properties/operation/const",keyword:"const",params:{allowedValue: "update"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
var valid15 = _errs93 === errors;
}
else {
var valid15 = true;
}
}
}
}
}
}
else {
const err77 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/Receipt/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
}
var _valid2 = _errs86 === errors;
if(_valid2 && valid12){
valid12 = false;
passing2 = [passing2, 2];
}
else {
if(_valid2){
valid12 = true;
passing2 = 2;
}
}
}
if(!valid12){
const err78 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/Receipt/oneOf",keyword:"oneOf",params:{passingSchemas: passing2},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
else {
errors = _errs71;
if(vErrors !== null){
if(_errs71){
vErrors.length = _errs71;
}
else {
vErrors = null;
}
}
}
var valid10 = _errs69 === errors;
}
else {
var valid10 = true;
}
if(valid10){
if(data.tool !== undefined){
let data30 = data.tool;
const _errs95 = errors;
if(typeof data30 !== "string"){
const err79 = {instancePath:instancePath+"/tool",schemaPath:"#/oneOf/2/properties/tool/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
if("content" !== data30){
const err80 = {instancePath:instancePath+"/tool",schemaPath:"#/oneOf/2/properties/tool/const",keyword:"const",params:{allowedValue: "content"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
var valid10 = _errs95 === errors;
}
else {
var valid10 = true;
}
}
}
}
}
else {
const err81 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
}
var _valid0 = _errs66 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
}
}
}
if(!valid0){
const err82 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
validate25.errors = vErrors;
return false;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate25.errors = vErrors;
return errors === 0;
}

const pattern0 = new RegExp("^-?[0-9]+$", "u");

function validate24(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((((((data.name === undefined) && (missing0 = "name")) || ((data.callId === undefined) && (missing0 = "callId"))) || ((data.callbackIds === undefined) && (missing0 = "callbackIds"))) || ((data.requestId === undefined) && (missing0 = "requestId"))) || ((data.action === undefined) && (missing0 = "action"))) || ((data.status === undefined) && (missing0 = "status"))){
validate24.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(((((((key0 === "action") || (key0 === "callId")) || (key0 === "callbackIds")) || (key0 === "name")) || (key0 === "requestId")) || (key0 === "status")) || (key0 === "version"))){
validate24.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.action !== undefined){
const _errs2 = errors;
if(!(validate25(data.action, {instancePath:instancePath+"/action",parentData:data,parentDataProperty:"action",rootData}))){
vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
errors = vErrors.length;
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.callId !== undefined){
const _errs3 = errors;
if(typeof data.callId !== "string"){
validate24.errors = [{instancePath:instancePath+"/callId",schemaPath:"#/properties/callId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs3 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.callbackIds !== undefined){
let data2 = data.callbackIds;
const _errs5 = errors;
if(errors === _errs5){
if(Array.isArray(data2)){
var valid1 = true;
const len0 = data2.length;
for(let i0=0; i0<len0; i0++){
let data3 = data2[i0];
const _errs7 = errors;
const _errs9 = errors;
let valid3 = false;
let passing0 = null;
const _errs10 = errors;
if(errors === _errs10){
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
let missing1;
if(((data3.kind === undefined) && (missing1 = "kind")) || ((data3.value === undefined) && (missing1 = "value"))){
const err0 = {instancePath:instancePath+"/callbackIds/" + i0,schemaPath:"#/definitions/CallbackId/oneOf/0/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
else {
const _errs12 = errors;
for(const key1 in data3){
if(!((key1 === "kind") || (key1 === "value"))){
const err1 = {instancePath:instancePath+"/callbackIds/" + i0,schemaPath:"#/definitions/CallbackId/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
break;
}
}
if(_errs12 === errors){
if(data3.kind !== undefined){
let data4 = data3.kind;
const _errs13 = errors;
if(typeof data4 !== "string"){
const err2 = {instancePath:instancePath+"/callbackIds/" + i0+"/kind",schemaPath:"#/definitions/CallbackId/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if("string" !== data4){
const err3 = {instancePath:instancePath+"/callbackIds/" + i0+"/kind",schemaPath:"#/definitions/CallbackId/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "string"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
var valid4 = _errs13 === errors;
}
else {
var valid4 = true;
}
if(valid4){
if(data3.value !== undefined){
const _errs15 = errors;
if(typeof data3.value !== "string"){
const err4 = {instancePath:instancePath+"/callbackIds/" + i0+"/value",schemaPath:"#/definitions/CallbackId/oneOf/0/properties/value/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
var valid4 = _errs15 === errors;
}
else {
var valid4 = true;
}
}
}
}
}
else {
const err5 = {instancePath:instancePath+"/callbackIds/" + i0,schemaPath:"#/definitions/CallbackId/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
var _valid0 = _errs10 === errors;
if(_valid0){
valid3 = true;
passing0 = 0;
}
const _errs17 = errors;
if(errors === _errs17){
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
let missing2;
if(((data3.kind === undefined) && (missing2 = "kind")) || ((data3.value === undefined) && (missing2 = "value"))){
const err6 = {instancePath:instancePath+"/callbackIds/" + i0,schemaPath:"#/definitions/CallbackId/oneOf/1/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
else {
const _errs19 = errors;
for(const key2 in data3){
if(!((key2 === "kind") || (key2 === "value"))){
const err7 = {instancePath:instancePath+"/callbackIds/" + i0,schemaPath:"#/definitions/CallbackId/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
break;
}
}
if(_errs19 === errors){
if(data3.kind !== undefined){
let data6 = data3.kind;
const _errs20 = errors;
if(typeof data6 !== "string"){
const err8 = {instancePath:instancePath+"/callbackIds/" + i0+"/kind",schemaPath:"#/definitions/CallbackId/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if("integer" !== data6){
const err9 = {instancePath:instancePath+"/callbackIds/" + i0+"/kind",schemaPath:"#/definitions/CallbackId/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "integer"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
var valid5 = _errs20 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data3.value !== undefined){
let data7 = data3.value;
const _errs22 = errors;
if(errors === _errs22){
if(typeof data7 === "string"){
if(!pattern0.test(data7)){
const err10 = {instancePath:instancePath+"/callbackIds/" + i0+"/value",schemaPath:"#/definitions/CallbackId/oneOf/1/properties/value/pattern",keyword:"pattern",params:{pattern: "^-?[0-9]+$"},message:"must match pattern \""+"^-?[0-9]+$"+"\""};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/callbackIds/" + i0+"/value",schemaPath:"#/definitions/CallbackId/oneOf/1/properties/value/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
var valid5 = _errs22 === errors;
}
else {
var valid5 = true;
}
}
}
}
}
else {
const err12 = {instancePath:instancePath+"/callbackIds/" + i0,schemaPath:"#/definitions/CallbackId/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
var _valid0 = _errs17 === errors;
if(_valid0 && valid3){
valid3 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid3 = true;
passing0 = 1;
}
}
if(!valid3){
const err13 = {instancePath:instancePath+"/callbackIds/" + i0,schemaPath:"#/definitions/CallbackId/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
validate24.errors = vErrors;
return false;
}
else {
errors = _errs9;
if(vErrors !== null){
if(_errs9){
vErrors.length = _errs9;
}
else {
vErrors = null;
}
}
}
var valid1 = _errs7 === errors;
if(!valid1){
break;
}
}
}
else {
validate24.errors = [{instancePath:instancePath+"/callbackIds",schemaPath:"#/properties/callbackIds/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
var valid0 = _errs5 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.name !== undefined){
const _errs24 = errors;
if(typeof data.name !== "string"){
validate24.errors = [{instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs24 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.requestId !== undefined){
const _errs26 = errors;
if(typeof data.requestId !== "string"){
validate24.errors = [{instancePath:instancePath+"/requestId",schemaPath:"#/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs26 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.status !== undefined){
let data10 = data.status;
const _errs28 = errors;
if(typeof data10 !== "string"){
validate24.errors = [{instancePath:instancePath+"/status",schemaPath:"#/definitions/Status/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!(((data10 === "applied") || (data10 === "rejected")) || (data10 === "uncertain"))){
validate24.errors = [{instancePath:instancePath+"/status",schemaPath:"#/definitions/Status/enum",keyword:"enum",params:{allowedValues: schema51.enum},message:"must be equal to one of the allowed values"}];
return false;
}
var valid0 = _errs28 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.version !== undefined){
let data11 = data.version;
const _errs31 = errors;
if((typeof data11 !== "string") && (data11 !== null)){
validate24.errors = [{instancePath:instancePath+"/version",schemaPath:"#/properties/version/type",keyword:"type",params:{type: schema37.properties.version.type},message:"must be string,null"}];
return false;
}
var valid0 = _errs31 === errors;
}
else {
var valid0 = true;
}
}
}
}
}
}
}
}
}
}
else {
validate24.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate24.errors = vErrors;
return errors === 0;
}


function validate21(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((((data.id === undefined) && (missing0 = "id")) || ((data.requestId === undefined) && (missing0 = "requestId"))) || ((data.role === undefined) && (missing0 = "role"))) || ((data.text === undefined) && (missing0 = "text"))){
validate21.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((((((key0 === "context") || (key0 === "id")) || (key0 === "requestId")) || (key0 === "role")) || (key0 === "text")) || (key0 === "tool"))){
validate21.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.context !== undefined){
let data0 = data.context;
const _errs2 = errors;
const _errs3 = errors;
let valid1 = false;
const _errs4 = errors;
if(!(validate22(data0, {instancePath:instancePath+"/context",parentData:data,parentDataProperty:"context",rootData}))){
vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
errors = vErrors.length;
}
var _valid0 = _errs4 === errors;
valid1 = valid1 || _valid0;
if(!valid1){
const _errs5 = errors;
if(data0 !== null){
const err0 = {instancePath:instancePath+"/context",schemaPath:"#/properties/context/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
var _valid0 = _errs5 === errors;
valid1 = valid1 || _valid0;
}
if(!valid1){
const err1 = {instancePath:instancePath+"/context",schemaPath:"#/properties/context/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
validate21.errors = vErrors;
return false;
}
else {
errors = _errs3;
if(vErrors !== null){
if(_errs3){
vErrors.length = _errs3;
}
else {
vErrors = null;
}
}
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.id !== undefined){
const _errs7 = errors;
if(typeof data.id !== "string"){
validate21.errors = [{instancePath:instancePath+"/id",schemaPath:"#/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs7 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.requestId !== undefined){
const _errs9 = errors;
if(typeof data.requestId !== "string"){
validate21.errors = [{instancePath:instancePath+"/requestId",schemaPath:"#/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs9 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.role !== undefined){
let data3 = data.role;
const _errs11 = errors;
if(typeof data3 !== "string"){
validate21.errors = [{instancePath:instancePath+"/role",schemaPath:"#/definitions/Role/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!(((data3 === "user") || (data3 === "assistant")) || (data3 === "tool"))){
validate21.errors = [{instancePath:instancePath+"/role",schemaPath:"#/definitions/Role/enum",keyword:"enum",params:{allowedValues: schema36.enum},message:"must be equal to one of the allowed values"}];
return false;
}
var valid0 = _errs11 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.text !== undefined){
const _errs14 = errors;
if(typeof data.text !== "string"){
validate21.errors = [{instancePath:instancePath+"/text",schemaPath:"#/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs14 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.tool !== undefined){
let data5 = data.tool;
const _errs16 = errors;
const _errs17 = errors;
let valid3 = false;
const _errs18 = errors;
if(!(validate24(data5, {instancePath:instancePath+"/tool",parentData:data,parentDataProperty:"tool",rootData}))){
vErrors = vErrors === null ? validate24.errors : vErrors.concat(validate24.errors);
errors = vErrors.length;
}
var _valid1 = _errs18 === errors;
valid3 = valid3 || _valid1;
if(!valid3){
const _errs19 = errors;
if(data5 !== null){
const err2 = {instancePath:instancePath+"/tool",schemaPath:"#/properties/tool/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
var _valid1 = _errs19 === errors;
valid3 = valid3 || _valid1;
}
if(!valid3){
const err3 = {instancePath:instancePath+"/tool",schemaPath:"#/properties/tool/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
validate21.errors = vErrors;
return false;
}
else {
errors = _errs17;
if(vErrors !== null){
if(_errs17){
vErrors.length = _errs17;
}
else {
vErrors = null;
}
}
}
var valid0 = _errs16 === errors;
}
else {
var valid0 = true;
}
}
}
}
}
}
}
}
}
else {
validate21.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate21.errors = vErrors;
return errors === 0;
}


function validate20(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((((((data.version === undefined) && (missing0 = "version")) || ((data.phase === undefined) && (missing0 = "phase"))) || ((data.messages === undefined) && (missing0 = "messages"))) || ((data.limited === undefined) && (missing0 = "limited"))) || ((data.omitted === undefined) && (missing0 = "omitted"))){
validate20.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(func2.call(schema32.properties, key0))){
validate20.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.error !== undefined){
let data0 = data.error;
const _errs2 = errors;
if((typeof data0 !== "string") && (data0 !== null)){
validate20.errors = [{instancePath:instancePath+"/error",schemaPath:"#/properties/error/type",keyword:"type",params:{type: schema32.properties.error.type},message:"must be string,null"}];
return false;
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.limited !== undefined){
const _errs4 = errors;
if(typeof data.limited !== "boolean"){
validate20.errors = [{instancePath:instancePath+"/limited",schemaPath:"#/properties/limited/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"}];
return false;
}
var valid0 = _errs4 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.messages !== undefined){
let data2 = data.messages;
const _errs6 = errors;
if(errors === _errs6){
if(Array.isArray(data2)){
var valid1 = true;
const len0 = data2.length;
for(let i0=0; i0<len0; i0++){
const _errs8 = errors;
if(!(validate21(data2[i0], {instancePath:instancePath+"/messages/" + i0,parentData:data2,parentDataProperty:i0,rootData}))){
vErrors = vErrors === null ? validate21.errors : vErrors.concat(validate21.errors);
errors = vErrors.length;
}
var valid1 = _errs8 === errors;
if(!valid1){
break;
}
}
}
else {
validate20.errors = [{instancePath:instancePath+"/messages",schemaPath:"#/properties/messages/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
var valid0 = _errs6 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.model !== undefined){
let data4 = data.model;
const _errs9 = errors;
if((typeof data4 !== "string") && (data4 !== null)){
validate20.errors = [{instancePath:instancePath+"/model",schemaPath:"#/properties/model/type",keyword:"type",params:{type: schema32.properties.model.type},message:"must be string,null"}];
return false;
}
var valid0 = _errs9 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.omitted !== undefined){
const _errs11 = errors;
if(typeof data.omitted !== "string"){
validate20.errors = [{instancePath:instancePath+"/omitted",schemaPath:"#/properties/omitted/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs11 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.phase !== undefined){
let data6 = data.phase;
const _errs13 = errors;
if(typeof data6 !== "string"){
validate20.errors = [{instancePath:instancePath+"/phase",schemaPath:"#/definitions/Phase/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!(((((((data6 === "idle") || (data6 === "starting")) || (data6 === "working")) || (data6 === "completed")) || (data6 === "interrupted")) || (data6 === "failed")) || (data6 === "unconfirmed"))){
validate20.errors = [{instancePath:instancePath+"/phase",schemaPath:"#/definitions/Phase/enum",keyword:"enum",params:{allowedValues: schema52.enum},message:"must be equal to one of the allowed values"}];
return false;
}
var valid0 = _errs13 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.thread !== undefined){
let data7 = data.thread;
const _errs16 = errors;
if((typeof data7 !== "string") && (data7 !== null)){
validate20.errors = [{instancePath:instancePath+"/thread",schemaPath:"#/properties/thread/type",keyword:"type",params:{type: schema32.properties.thread.type},message:"must be string,null"}];
return false;
}
var valid0 = _errs16 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.turn !== undefined){
let data8 = data.turn;
const _errs18 = errors;
if((typeof data8 !== "string") && (data8 !== null)){
validate20.errors = [{instancePath:instancePath+"/turn",schemaPath:"#/properties/turn/type",keyword:"type",params:{type: schema32.properties.turn.type},message:"must be string,null"}];
return false;
}
var valid0 = _errs18 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.version !== undefined){
const _errs20 = errors;
if(typeof data.version !== "string"){
validate20.errors = [{instancePath:instancePath+"/version",schemaPath:"#/properties/version/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs20 === errors;
}
else {
var valid0 = true;
}
}
}
}
}
}
}
}
}
}
}
}
else {
validate20.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate20.errors = vErrors;
return errors === 0;
}

export const notes = validate33;
const schema53 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"properties":{"text":{"type":"string"},"title":{"type":"string"}},"required":["title","text"],"title":"Notes","type":"object"};

function validate33(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((data.title === undefined) && (missing0 = "title")) || ((data.text === undefined) && (missing0 = "text"))){
validate33.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((key0 === "text") || (key0 === "title"))){
validate33.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.text !== undefined){
const _errs2 = errors;
if(typeof data.text !== "string"){
validate33.errors = [{instancePath:instancePath+"/text",schemaPath:"#/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.title !== undefined){
const _errs4 = errors;
if(typeof data.title !== "string"){
validate33.errors = [{instancePath:instancePath+"/title",schemaPath:"#/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs4 === errors;
}
else {
var valid0 = true;
}
}
}
}
}
else {
validate33.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate33.errors = vErrors;
return errors === 0;
}

export const processResponse = validate34;
const schema54 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"definitions":{"ProcessInfo":{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"cwd":{"type":"string"},"foreground":{"type":["string","null"]},"pid":{"maximum":4294967295,"minimum":0,"type":["integer","null"]},"state":{"type":"string"},"terminalId":{"type":"string"}},"required":["contentId","terminalId","cwd","state"],"type":"object"},"ProcessOutput":{"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"list","type":"string"},"processes":{"items":{"$ref":"#/definitions/ProcessInfo"},"type":"array"},"unavailable":{"items":{"type":"string"},"type":"array"}},"required":["operation","processes","unavailable"],"type":"object"},{"additionalProperties":false,"properties":{"complete":{"type":"boolean"},"how":{"type":"string"},"limited":{"type":"boolean"},"operation":{"const":"read","type":"string"},"target":{"$ref":"#/definitions/ProcessInfo"},"text":{"type":"string"},"why":{"type":["string","null"]}},"required":["operation","target","text","complete","how","limited"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"send","type":"string"},"started":{"type":["boolean","null"]},"status":{"type":["string","null"]},"target":{"$ref":"#/definitions/ProcessInfo"},"turn":{"type":"string"}},"required":["operation","target","turn"],"type":"object"},{"additionalProperties":false,"properties":{"key":{"type":"string"},"operation":{"const":"interrupt","type":"string"},"outcome":{"type":"string"},"target":{"$ref":"#/definitions/ProcessInfo"}},"required":["operation","target","key","outcome"],"type":"object"},{"additionalProperties":false,"properties":{"observed":{"$ref":"#/definitions/ProcessInfo"},"operation":{"const":"stop","type":"string"},"target":{"$ref":"#/definitions/ProcessInfo"}},"required":["operation","target","observed"],"type":"object"}]},"Status":{"enum":["applied","rejected","uncertain"],"type":"string"}},"properties":{"fresh":{"type":"boolean"},"message":{"type":["string","null"]},"output":{"anyOf":[{"$ref":"#/definitions/ProcessOutput"},{"type":"null"}]},"requestId":{"type":"string"},"status":{"$ref":"#/definitions/Status"},"version":{"type":"string"}},"required":["requestId","status","version","fresh"],"title":"ProcessResponse","type":"object"};
const schema62 = {"enum":["applied","rejected","uncertain"],"type":"string"};
const schema55 = {"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"list","type":"string"},"processes":{"items":{"$ref":"#/definitions/ProcessInfo"},"type":"array"},"unavailable":{"items":{"type":"string"},"type":"array"}},"required":["operation","processes","unavailable"],"type":"object"},{"additionalProperties":false,"properties":{"complete":{"type":"boolean"},"how":{"type":"string"},"limited":{"type":"boolean"},"operation":{"const":"read","type":"string"},"target":{"$ref":"#/definitions/ProcessInfo"},"text":{"type":"string"},"why":{"type":["string","null"]}},"required":["operation","target","text","complete","how","limited"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"send","type":"string"},"started":{"type":["boolean","null"]},"status":{"type":["string","null"]},"target":{"$ref":"#/definitions/ProcessInfo"},"turn":{"type":"string"}},"required":["operation","target","turn"],"type":"object"},{"additionalProperties":false,"properties":{"key":{"type":"string"},"operation":{"const":"interrupt","type":"string"},"outcome":{"type":"string"},"target":{"$ref":"#/definitions/ProcessInfo"}},"required":["operation","target","key","outcome"],"type":"object"},{"additionalProperties":false,"properties":{"observed":{"$ref":"#/definitions/ProcessInfo"},"operation":{"const":"stop","type":"string"},"target":{"$ref":"#/definitions/ProcessInfo"}},"required":["operation","target","observed"],"type":"object"}]};
const schema56 = {"additionalProperties":false,"properties":{"contentId":{"type":"string"},"cwd":{"type":"string"},"foreground":{"type":["string","null"]},"pid":{"maximum":4294967295,"minimum":0,"type":["integer","null"]},"state":{"type":"string"},"terminalId":{"type":"string"}},"required":["contentId","terminalId","cwd","state"],"type":"object"};

function validate35(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(errors === _errs1){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((((data.operation === undefined) && (missing0 = "operation")) || ((data.processes === undefined) && (missing0 = "processes"))) || ((data.unavailable === undefined) && (missing0 = "unavailable"))){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
else {
const _errs3 = errors;
for(const key0 in data){
if(!(((key0 === "operation") || (key0 === "processes")) || (key0 === "unavailable"))){
const err1 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
break;
}
}
if(_errs3 === errors){
if(data.operation !== undefined){
let data0 = data.operation;
const _errs4 = errors;
if(typeof data0 !== "string"){
const err2 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/0/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if("list" !== data0){
const err3 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/0/properties/operation/const",keyword:"const",params:{allowedValue: "list"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
var valid1 = _errs4 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.processes !== undefined){
let data1 = data.processes;
const _errs6 = errors;
if(errors === _errs6){
if(Array.isArray(data1)){
var valid2 = true;
const len0 = data1.length;
for(let i0=0; i0<len0; i0++){
let data2 = data1[i0];
const _errs8 = errors;
const _errs9 = errors;
if(errors === _errs9){
if(data2 && typeof data2 == "object" && !Array.isArray(data2)){
let missing1;
if(((((data2.contentId === undefined) && (missing1 = "contentId")) || ((data2.terminalId === undefined) && (missing1 = "terminalId"))) || ((data2.cwd === undefined) && (missing1 = "cwd"))) || ((data2.state === undefined) && (missing1 = "state"))){
const err4 = {instancePath:instancePath+"/processes/" + i0,schemaPath:"#/definitions/ProcessInfo/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
else {
const _errs11 = errors;
for(const key1 in data2){
if(!((((((key1 === "contentId") || (key1 === "cwd")) || (key1 === "foreground")) || (key1 === "pid")) || (key1 === "state")) || (key1 === "terminalId"))){
const err5 = {instancePath:instancePath+"/processes/" + i0,schemaPath:"#/definitions/ProcessInfo/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
break;
}
}
if(_errs11 === errors){
if(data2.contentId !== undefined){
const _errs12 = errors;
if(typeof data2.contentId !== "string"){
const err6 = {instancePath:instancePath+"/processes/" + i0+"/contentId",schemaPath:"#/definitions/ProcessInfo/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
var valid4 = _errs12 === errors;
}
else {
var valid4 = true;
}
if(valid4){
if(data2.cwd !== undefined){
const _errs14 = errors;
if(typeof data2.cwd !== "string"){
const err7 = {instancePath:instancePath+"/processes/" + i0+"/cwd",schemaPath:"#/definitions/ProcessInfo/properties/cwd/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
var valid4 = _errs14 === errors;
}
else {
var valid4 = true;
}
if(valid4){
if(data2.foreground !== undefined){
let data5 = data2.foreground;
const _errs16 = errors;
if((typeof data5 !== "string") && (data5 !== null)){
const err8 = {instancePath:instancePath+"/processes/" + i0+"/foreground",schemaPath:"#/definitions/ProcessInfo/properties/foreground/type",keyword:"type",params:{type: schema56.properties.foreground.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
var valid4 = _errs16 === errors;
}
else {
var valid4 = true;
}
if(valid4){
if(data2.pid !== undefined){
let data6 = data2.pid;
const _errs18 = errors;
if((!(((typeof data6 == "number") && (!(data6 % 1) && !isNaN(data6))) && (isFinite(data6)))) && (data6 !== null)){
const err9 = {instancePath:instancePath+"/processes/" + i0+"/pid",schemaPath:"#/definitions/ProcessInfo/properties/pid/type",keyword:"type",params:{type: schema56.properties.pid.type},message:"must be integer,null"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(errors === _errs18){
if((typeof data6 == "number") && (isFinite(data6))){
if(data6 > 4294967295 || isNaN(data6)){
const err10 = {instancePath:instancePath+"/processes/" + i0+"/pid",schemaPath:"#/definitions/ProcessInfo/properties/pid/maximum",keyword:"maximum",params:{comparison: "<=", limit: 4294967295},message:"must be <= 4294967295"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
else {
if(data6 < 0 || isNaN(data6)){
const err11 = {instancePath:instancePath+"/processes/" + i0+"/pid",schemaPath:"#/definitions/ProcessInfo/properties/pid/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
}
}
var valid4 = _errs18 === errors;
}
else {
var valid4 = true;
}
if(valid4){
if(data2.state !== undefined){
const _errs20 = errors;
if(typeof data2.state !== "string"){
const err12 = {instancePath:instancePath+"/processes/" + i0+"/state",schemaPath:"#/definitions/ProcessInfo/properties/state/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
var valid4 = _errs20 === errors;
}
else {
var valid4 = true;
}
if(valid4){
if(data2.terminalId !== undefined){
const _errs22 = errors;
if(typeof data2.terminalId !== "string"){
const err13 = {instancePath:instancePath+"/processes/" + i0+"/terminalId",schemaPath:"#/definitions/ProcessInfo/properties/terminalId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
var valid4 = _errs22 === errors;
}
else {
var valid4 = true;
}
}
}
}
}
}
}
}
}
else {
const err14 = {instancePath:instancePath+"/processes/" + i0,schemaPath:"#/definitions/ProcessInfo/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
var valid2 = _errs8 === errors;
if(!valid2){
break;
}
}
}
else {
const err15 = {instancePath:instancePath+"/processes",schemaPath:"#/oneOf/0/properties/processes/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
var valid1 = _errs6 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.unavailable !== undefined){
let data9 = data.unavailable;
const _errs24 = errors;
if(errors === _errs24){
if(Array.isArray(data9)){
var valid5 = true;
const len1 = data9.length;
for(let i1=0; i1<len1; i1++){
const _errs26 = errors;
if(typeof data9[i1] !== "string"){
const err16 = {instancePath:instancePath+"/unavailable/" + i1,schemaPath:"#/oneOf/0/properties/unavailable/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
var valid5 = _errs26 === errors;
if(!valid5){
break;
}
}
}
else {
const err17 = {instancePath:instancePath+"/unavailable",schemaPath:"#/oneOf/0/properties/unavailable/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
var valid1 = _errs24 === errors;
}
else {
var valid1 = true;
}
}
}
}
}
}
else {
const err18 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
}
const _errs28 = errors;
if(errors === _errs28){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing2;
if(((((((data.operation === undefined) && (missing2 = "operation")) || ((data.target === undefined) && (missing2 = "target"))) || ((data.text === undefined) && (missing2 = "text"))) || ((data.complete === undefined) && (missing2 = "complete"))) || ((data.how === undefined) && (missing2 = "how"))) || ((data.limited === undefined) && (missing2 = "limited"))){
const err19 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
else {
const _errs30 = errors;
for(const key2 in data){
if(!(((((((key2 === "complete") || (key2 === "how")) || (key2 === "limited")) || (key2 === "operation")) || (key2 === "target")) || (key2 === "text")) || (key2 === "why"))){
const err20 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
break;
}
}
if(_errs30 === errors){
if(data.complete !== undefined){
const _errs31 = errors;
if(typeof data.complete !== "boolean"){
const err21 = {instancePath:instancePath+"/complete",schemaPath:"#/oneOf/1/properties/complete/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
var valid6 = _errs31 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data.how !== undefined){
const _errs33 = errors;
if(typeof data.how !== "string"){
const err22 = {instancePath:instancePath+"/how",schemaPath:"#/oneOf/1/properties/how/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
var valid6 = _errs33 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data.limited !== undefined){
const _errs35 = errors;
if(typeof data.limited !== "boolean"){
const err23 = {instancePath:instancePath+"/limited",schemaPath:"#/oneOf/1/properties/limited/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
var valid6 = _errs35 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data.operation !== undefined){
let data14 = data.operation;
const _errs37 = errors;
if(typeof data14 !== "string"){
const err24 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/1/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if("read" !== data14){
const err25 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/1/properties/operation/const",keyword:"const",params:{allowedValue: "read"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
var valid6 = _errs37 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data.target !== undefined){
let data15 = data.target;
const _errs39 = errors;
const _errs40 = errors;
if(errors === _errs40){
if(data15 && typeof data15 == "object" && !Array.isArray(data15)){
let missing3;
if(((((data15.contentId === undefined) && (missing3 = "contentId")) || ((data15.terminalId === undefined) && (missing3 = "terminalId"))) || ((data15.cwd === undefined) && (missing3 = "cwd"))) || ((data15.state === undefined) && (missing3 = "state"))){
const err26 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/ProcessInfo/required",keyword:"required",params:{missingProperty: missing3},message:"must have required property '"+missing3+"'"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
else {
const _errs42 = errors;
for(const key3 in data15){
if(!((((((key3 === "contentId") || (key3 === "cwd")) || (key3 === "foreground")) || (key3 === "pid")) || (key3 === "state")) || (key3 === "terminalId"))){
const err27 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/ProcessInfo/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
break;
}
}
if(_errs42 === errors){
if(data15.contentId !== undefined){
const _errs43 = errors;
if(typeof data15.contentId !== "string"){
const err28 = {instancePath:instancePath+"/target/contentId",schemaPath:"#/definitions/ProcessInfo/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
var valid8 = _errs43 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data15.cwd !== undefined){
const _errs45 = errors;
if(typeof data15.cwd !== "string"){
const err29 = {instancePath:instancePath+"/target/cwd",schemaPath:"#/definitions/ProcessInfo/properties/cwd/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
var valid8 = _errs45 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data15.foreground !== undefined){
let data18 = data15.foreground;
const _errs47 = errors;
if((typeof data18 !== "string") && (data18 !== null)){
const err30 = {instancePath:instancePath+"/target/foreground",schemaPath:"#/definitions/ProcessInfo/properties/foreground/type",keyword:"type",params:{type: schema56.properties.foreground.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
var valid8 = _errs47 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data15.pid !== undefined){
let data19 = data15.pid;
const _errs49 = errors;
if((!(((typeof data19 == "number") && (!(data19 % 1) && !isNaN(data19))) && (isFinite(data19)))) && (data19 !== null)){
const err31 = {instancePath:instancePath+"/target/pid",schemaPath:"#/definitions/ProcessInfo/properties/pid/type",keyword:"type",params:{type: schema56.properties.pid.type},message:"must be integer,null"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
if(errors === _errs49){
if((typeof data19 == "number") && (isFinite(data19))){
if(data19 > 4294967295 || isNaN(data19)){
const err32 = {instancePath:instancePath+"/target/pid",schemaPath:"#/definitions/ProcessInfo/properties/pid/maximum",keyword:"maximum",params:{comparison: "<=", limit: 4294967295},message:"must be <= 4294967295"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
else {
if(data19 < 0 || isNaN(data19)){
const err33 = {instancePath:instancePath+"/target/pid",schemaPath:"#/definitions/ProcessInfo/properties/pid/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
}
}
var valid8 = _errs49 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data15.state !== undefined){
const _errs51 = errors;
if(typeof data15.state !== "string"){
const err34 = {instancePath:instancePath+"/target/state",schemaPath:"#/definitions/ProcessInfo/properties/state/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
var valid8 = _errs51 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data15.terminalId !== undefined){
const _errs53 = errors;
if(typeof data15.terminalId !== "string"){
const err35 = {instancePath:instancePath+"/target/terminalId",schemaPath:"#/definitions/ProcessInfo/properties/terminalId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
var valid8 = _errs53 === errors;
}
else {
var valid8 = true;
}
}
}
}
}
}
}
}
}
else {
const err36 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/ProcessInfo/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
var valid6 = _errs39 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data.text !== undefined){
const _errs55 = errors;
if(typeof data.text !== "string"){
const err37 = {instancePath:instancePath+"/text",schemaPath:"#/oneOf/1/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
var valid6 = _errs55 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data.why !== undefined){
let data23 = data.why;
const _errs57 = errors;
if((typeof data23 !== "string") && (data23 !== null)){
const err38 = {instancePath:instancePath+"/why",schemaPath:"#/oneOf/1/properties/why/type",keyword:"type",params:{type: schema55.oneOf[1].properties.why.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
var valid6 = _errs57 === errors;
}
else {
var valid6 = true;
}
}
}
}
}
}
}
}
}
}
else {
const err39 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
var _valid0 = _errs28 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
}
const _errs59 = errors;
if(errors === _errs59){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing4;
if((((data.operation === undefined) && (missing4 = "operation")) || ((data.target === undefined) && (missing4 = "target"))) || ((data.turn === undefined) && (missing4 = "turn"))){
const err40 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: missing4},message:"must have required property '"+missing4+"'"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
else {
const _errs61 = errors;
for(const key4 in data){
if(!(((((key4 === "operation") || (key4 === "started")) || (key4 === "status")) || (key4 === "target")) || (key4 === "turn"))){
const err41 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
break;
}
}
if(_errs61 === errors){
if(data.operation !== undefined){
let data24 = data.operation;
const _errs62 = errors;
if(typeof data24 !== "string"){
const err42 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/2/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
if("send" !== data24){
const err43 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/2/properties/operation/const",keyword:"const",params:{allowedValue: "send"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
var valid9 = _errs62 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data.started !== undefined){
let data25 = data.started;
const _errs64 = errors;
if((typeof data25 !== "boolean") && (data25 !== null)){
const err44 = {instancePath:instancePath+"/started",schemaPath:"#/oneOf/2/properties/started/type",keyword:"type",params:{type: schema55.oneOf[2].properties.started.type},message:"must be boolean,null"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
var valid9 = _errs64 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data.status !== undefined){
let data26 = data.status;
const _errs66 = errors;
if((typeof data26 !== "string") && (data26 !== null)){
const err45 = {instancePath:instancePath+"/status",schemaPath:"#/oneOf/2/properties/status/type",keyword:"type",params:{type: schema55.oneOf[2].properties.status.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
var valid9 = _errs66 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data.target !== undefined){
let data27 = data.target;
const _errs68 = errors;
const _errs69 = errors;
if(errors === _errs69){
if(data27 && typeof data27 == "object" && !Array.isArray(data27)){
let missing5;
if(((((data27.contentId === undefined) && (missing5 = "contentId")) || ((data27.terminalId === undefined) && (missing5 = "terminalId"))) || ((data27.cwd === undefined) && (missing5 = "cwd"))) || ((data27.state === undefined) && (missing5 = "state"))){
const err46 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/ProcessInfo/required",keyword:"required",params:{missingProperty: missing5},message:"must have required property '"+missing5+"'"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
else {
const _errs71 = errors;
for(const key5 in data27){
if(!((((((key5 === "contentId") || (key5 === "cwd")) || (key5 === "foreground")) || (key5 === "pid")) || (key5 === "state")) || (key5 === "terminalId"))){
const err47 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/ProcessInfo/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
break;
}
}
if(_errs71 === errors){
if(data27.contentId !== undefined){
const _errs72 = errors;
if(typeof data27.contentId !== "string"){
const err48 = {instancePath:instancePath+"/target/contentId",schemaPath:"#/definitions/ProcessInfo/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
var valid11 = _errs72 === errors;
}
else {
var valid11 = true;
}
if(valid11){
if(data27.cwd !== undefined){
const _errs74 = errors;
if(typeof data27.cwd !== "string"){
const err49 = {instancePath:instancePath+"/target/cwd",schemaPath:"#/definitions/ProcessInfo/properties/cwd/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
var valid11 = _errs74 === errors;
}
else {
var valid11 = true;
}
if(valid11){
if(data27.foreground !== undefined){
let data30 = data27.foreground;
const _errs76 = errors;
if((typeof data30 !== "string") && (data30 !== null)){
const err50 = {instancePath:instancePath+"/target/foreground",schemaPath:"#/definitions/ProcessInfo/properties/foreground/type",keyword:"type",params:{type: schema56.properties.foreground.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
var valid11 = _errs76 === errors;
}
else {
var valid11 = true;
}
if(valid11){
if(data27.pid !== undefined){
let data31 = data27.pid;
const _errs78 = errors;
if((!(((typeof data31 == "number") && (!(data31 % 1) && !isNaN(data31))) && (isFinite(data31)))) && (data31 !== null)){
const err51 = {instancePath:instancePath+"/target/pid",schemaPath:"#/definitions/ProcessInfo/properties/pid/type",keyword:"type",params:{type: schema56.properties.pid.type},message:"must be integer,null"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
if(errors === _errs78){
if((typeof data31 == "number") && (isFinite(data31))){
if(data31 > 4294967295 || isNaN(data31)){
const err52 = {instancePath:instancePath+"/target/pid",schemaPath:"#/definitions/ProcessInfo/properties/pid/maximum",keyword:"maximum",params:{comparison: "<=", limit: 4294967295},message:"must be <= 4294967295"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
else {
if(data31 < 0 || isNaN(data31)){
const err53 = {instancePath:instancePath+"/target/pid",schemaPath:"#/definitions/ProcessInfo/properties/pid/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
}
}
}
var valid11 = _errs78 === errors;
}
else {
var valid11 = true;
}
if(valid11){
if(data27.state !== undefined){
const _errs80 = errors;
if(typeof data27.state !== "string"){
const err54 = {instancePath:instancePath+"/target/state",schemaPath:"#/definitions/ProcessInfo/properties/state/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
var valid11 = _errs80 === errors;
}
else {
var valid11 = true;
}
if(valid11){
if(data27.terminalId !== undefined){
const _errs82 = errors;
if(typeof data27.terminalId !== "string"){
const err55 = {instancePath:instancePath+"/target/terminalId",schemaPath:"#/definitions/ProcessInfo/properties/terminalId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
var valid11 = _errs82 === errors;
}
else {
var valid11 = true;
}
}
}
}
}
}
}
}
}
else {
const err56 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/ProcessInfo/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
}
var valid9 = _errs68 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data.turn !== undefined){
const _errs84 = errors;
if(typeof data.turn !== "string"){
const err57 = {instancePath:instancePath+"/turn",schemaPath:"#/oneOf/2/properties/turn/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
var valid9 = _errs84 === errors;
}
else {
var valid9 = true;
}
}
}
}
}
}
}
}
else {
const err58 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
}
var _valid0 = _errs59 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
}
const _errs86 = errors;
if(errors === _errs86){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing6;
if(((((data.operation === undefined) && (missing6 = "operation")) || ((data.target === undefined) && (missing6 = "target"))) || ((data.key === undefined) && (missing6 = "key"))) || ((data.outcome === undefined) && (missing6 = "outcome"))){
const err59 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: missing6},message:"must have required property '"+missing6+"'"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
else {
const _errs88 = errors;
for(const key6 in data){
if(!((((key6 === "key") || (key6 === "operation")) || (key6 === "outcome")) || (key6 === "target"))){
const err60 = {instancePath,schemaPath:"#/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
break;
}
}
if(_errs88 === errors){
if(data.key !== undefined){
const _errs89 = errors;
if(typeof data.key !== "string"){
const err61 = {instancePath:instancePath+"/key",schemaPath:"#/oneOf/3/properties/key/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
var valid12 = _errs89 === errors;
}
else {
var valid12 = true;
}
if(valid12){
if(data.operation !== undefined){
let data36 = data.operation;
const _errs91 = errors;
if(typeof data36 !== "string"){
const err62 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/3/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
if("interrupt" !== data36){
const err63 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/3/properties/operation/const",keyword:"const",params:{allowedValue: "interrupt"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
var valid12 = _errs91 === errors;
}
else {
var valid12 = true;
}
if(valid12){
if(data.outcome !== undefined){
const _errs93 = errors;
if(typeof data.outcome !== "string"){
const err64 = {instancePath:instancePath+"/outcome",schemaPath:"#/oneOf/3/properties/outcome/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
var valid12 = _errs93 === errors;
}
else {
var valid12 = true;
}
if(valid12){
if(data.target !== undefined){
let data38 = data.target;
const _errs95 = errors;
const _errs96 = errors;
if(errors === _errs96){
if(data38 && typeof data38 == "object" && !Array.isArray(data38)){
let missing7;
if(((((data38.contentId === undefined) && (missing7 = "contentId")) || ((data38.terminalId === undefined) && (missing7 = "terminalId"))) || ((data38.cwd === undefined) && (missing7 = "cwd"))) || ((data38.state === undefined) && (missing7 = "state"))){
const err65 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/ProcessInfo/required",keyword:"required",params:{missingProperty: missing7},message:"must have required property '"+missing7+"'"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
else {
const _errs98 = errors;
for(const key7 in data38){
if(!((((((key7 === "contentId") || (key7 === "cwd")) || (key7 === "foreground")) || (key7 === "pid")) || (key7 === "state")) || (key7 === "terminalId"))){
const err66 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/ProcessInfo/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key7},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
break;
}
}
if(_errs98 === errors){
if(data38.contentId !== undefined){
const _errs99 = errors;
if(typeof data38.contentId !== "string"){
const err67 = {instancePath:instancePath+"/target/contentId",schemaPath:"#/definitions/ProcessInfo/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
var valid14 = _errs99 === errors;
}
else {
var valid14 = true;
}
if(valid14){
if(data38.cwd !== undefined){
const _errs101 = errors;
if(typeof data38.cwd !== "string"){
const err68 = {instancePath:instancePath+"/target/cwd",schemaPath:"#/definitions/ProcessInfo/properties/cwd/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
var valid14 = _errs101 === errors;
}
else {
var valid14 = true;
}
if(valid14){
if(data38.foreground !== undefined){
let data41 = data38.foreground;
const _errs103 = errors;
if((typeof data41 !== "string") && (data41 !== null)){
const err69 = {instancePath:instancePath+"/target/foreground",schemaPath:"#/definitions/ProcessInfo/properties/foreground/type",keyword:"type",params:{type: schema56.properties.foreground.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
var valid14 = _errs103 === errors;
}
else {
var valid14 = true;
}
if(valid14){
if(data38.pid !== undefined){
let data42 = data38.pid;
const _errs105 = errors;
if((!(((typeof data42 == "number") && (!(data42 % 1) && !isNaN(data42))) && (isFinite(data42)))) && (data42 !== null)){
const err70 = {instancePath:instancePath+"/target/pid",schemaPath:"#/definitions/ProcessInfo/properties/pid/type",keyword:"type",params:{type: schema56.properties.pid.type},message:"must be integer,null"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
if(errors === _errs105){
if((typeof data42 == "number") && (isFinite(data42))){
if(data42 > 4294967295 || isNaN(data42)){
const err71 = {instancePath:instancePath+"/target/pid",schemaPath:"#/definitions/ProcessInfo/properties/pid/maximum",keyword:"maximum",params:{comparison: "<=", limit: 4294967295},message:"must be <= 4294967295"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
else {
if(data42 < 0 || isNaN(data42)){
const err72 = {instancePath:instancePath+"/target/pid",schemaPath:"#/definitions/ProcessInfo/properties/pid/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
}
}
}
var valid14 = _errs105 === errors;
}
else {
var valid14 = true;
}
if(valid14){
if(data38.state !== undefined){
const _errs107 = errors;
if(typeof data38.state !== "string"){
const err73 = {instancePath:instancePath+"/target/state",schemaPath:"#/definitions/ProcessInfo/properties/state/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
var valid14 = _errs107 === errors;
}
else {
var valid14 = true;
}
if(valid14){
if(data38.terminalId !== undefined){
const _errs109 = errors;
if(typeof data38.terminalId !== "string"){
const err74 = {instancePath:instancePath+"/target/terminalId",schemaPath:"#/definitions/ProcessInfo/properties/terminalId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
var valid14 = _errs109 === errors;
}
else {
var valid14 = true;
}
}
}
}
}
}
}
}
}
else {
const err75 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/ProcessInfo/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
}
var valid12 = _errs95 === errors;
}
else {
var valid12 = true;
}
}
}
}
}
}
}
else {
const err76 = {instancePath,schemaPath:"#/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
}
var _valid0 = _errs86 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid0 = true;
passing0 = 3;
}
const _errs111 = errors;
if(errors === _errs111){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing8;
if((((data.operation === undefined) && (missing8 = "operation")) || ((data.target === undefined) && (missing8 = "target"))) || ((data.observed === undefined) && (missing8 = "observed"))){
const err77 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: missing8},message:"must have required property '"+missing8+"'"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
else {
const _errs113 = errors;
for(const key8 in data){
if(!(((key8 === "observed") || (key8 === "operation")) || (key8 === "target"))){
const err78 = {instancePath,schemaPath:"#/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key8},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
break;
}
}
if(_errs113 === errors){
if(data.observed !== undefined){
let data45 = data.observed;
const _errs114 = errors;
const _errs115 = errors;
if(errors === _errs115){
if(data45 && typeof data45 == "object" && !Array.isArray(data45)){
let missing9;
if(((((data45.contentId === undefined) && (missing9 = "contentId")) || ((data45.terminalId === undefined) && (missing9 = "terminalId"))) || ((data45.cwd === undefined) && (missing9 = "cwd"))) || ((data45.state === undefined) && (missing9 = "state"))){
const err79 = {instancePath:instancePath+"/observed",schemaPath:"#/definitions/ProcessInfo/required",keyword:"required",params:{missingProperty: missing9},message:"must have required property '"+missing9+"'"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
else {
const _errs117 = errors;
for(const key9 in data45){
if(!((((((key9 === "contentId") || (key9 === "cwd")) || (key9 === "foreground")) || (key9 === "pid")) || (key9 === "state")) || (key9 === "terminalId"))){
const err80 = {instancePath:instancePath+"/observed",schemaPath:"#/definitions/ProcessInfo/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key9},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
break;
}
}
if(_errs117 === errors){
if(data45.contentId !== undefined){
const _errs118 = errors;
if(typeof data45.contentId !== "string"){
const err81 = {instancePath:instancePath+"/observed/contentId",schemaPath:"#/definitions/ProcessInfo/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
var valid17 = _errs118 === errors;
}
else {
var valid17 = true;
}
if(valid17){
if(data45.cwd !== undefined){
const _errs120 = errors;
if(typeof data45.cwd !== "string"){
const err82 = {instancePath:instancePath+"/observed/cwd",schemaPath:"#/definitions/ProcessInfo/properties/cwd/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
var valid17 = _errs120 === errors;
}
else {
var valid17 = true;
}
if(valid17){
if(data45.foreground !== undefined){
let data48 = data45.foreground;
const _errs122 = errors;
if((typeof data48 !== "string") && (data48 !== null)){
const err83 = {instancePath:instancePath+"/observed/foreground",schemaPath:"#/definitions/ProcessInfo/properties/foreground/type",keyword:"type",params:{type: schema56.properties.foreground.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
var valid17 = _errs122 === errors;
}
else {
var valid17 = true;
}
if(valid17){
if(data45.pid !== undefined){
let data49 = data45.pid;
const _errs124 = errors;
if((!(((typeof data49 == "number") && (!(data49 % 1) && !isNaN(data49))) && (isFinite(data49)))) && (data49 !== null)){
const err84 = {instancePath:instancePath+"/observed/pid",schemaPath:"#/definitions/ProcessInfo/properties/pid/type",keyword:"type",params:{type: schema56.properties.pid.type},message:"must be integer,null"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
if(errors === _errs124){
if((typeof data49 == "number") && (isFinite(data49))){
if(data49 > 4294967295 || isNaN(data49)){
const err85 = {instancePath:instancePath+"/observed/pid",schemaPath:"#/definitions/ProcessInfo/properties/pid/maximum",keyword:"maximum",params:{comparison: "<=", limit: 4294967295},message:"must be <= 4294967295"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
else {
if(data49 < 0 || isNaN(data49)){
const err86 = {instancePath:instancePath+"/observed/pid",schemaPath:"#/definitions/ProcessInfo/properties/pid/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
}
}
}
var valid17 = _errs124 === errors;
}
else {
var valid17 = true;
}
if(valid17){
if(data45.state !== undefined){
const _errs126 = errors;
if(typeof data45.state !== "string"){
const err87 = {instancePath:instancePath+"/observed/state",schemaPath:"#/definitions/ProcessInfo/properties/state/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
var valid17 = _errs126 === errors;
}
else {
var valid17 = true;
}
if(valid17){
if(data45.terminalId !== undefined){
const _errs128 = errors;
if(typeof data45.terminalId !== "string"){
const err88 = {instancePath:instancePath+"/observed/terminalId",schemaPath:"#/definitions/ProcessInfo/properties/terminalId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
var valid17 = _errs128 === errors;
}
else {
var valid17 = true;
}
}
}
}
}
}
}
}
}
else {
const err89 = {instancePath:instancePath+"/observed",schemaPath:"#/definitions/ProcessInfo/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
}
var valid15 = _errs114 === errors;
}
else {
var valid15 = true;
}
if(valid15){
if(data.operation !== undefined){
let data52 = data.operation;
const _errs130 = errors;
if(typeof data52 !== "string"){
const err90 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/4/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
if("stop" !== data52){
const err91 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/4/properties/operation/const",keyword:"const",params:{allowedValue: "stop"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
}
var valid15 = _errs130 === errors;
}
else {
var valid15 = true;
}
if(valid15){
if(data.target !== undefined){
let data53 = data.target;
const _errs132 = errors;
const _errs133 = errors;
if(errors === _errs133){
if(data53 && typeof data53 == "object" && !Array.isArray(data53)){
let missing10;
if(((((data53.contentId === undefined) && (missing10 = "contentId")) || ((data53.terminalId === undefined) && (missing10 = "terminalId"))) || ((data53.cwd === undefined) && (missing10 = "cwd"))) || ((data53.state === undefined) && (missing10 = "state"))){
const err92 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/ProcessInfo/required",keyword:"required",params:{missingProperty: missing10},message:"must have required property '"+missing10+"'"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
else {
const _errs135 = errors;
for(const key10 in data53){
if(!((((((key10 === "contentId") || (key10 === "cwd")) || (key10 === "foreground")) || (key10 === "pid")) || (key10 === "state")) || (key10 === "terminalId"))){
const err93 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/ProcessInfo/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key10},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err93];
}
else {
vErrors.push(err93);
}
errors++;
break;
}
}
if(_errs135 === errors){
if(data53.contentId !== undefined){
const _errs136 = errors;
if(typeof data53.contentId !== "string"){
const err94 = {instancePath:instancePath+"/target/contentId",schemaPath:"#/definitions/ProcessInfo/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
var valid19 = _errs136 === errors;
}
else {
var valid19 = true;
}
if(valid19){
if(data53.cwd !== undefined){
const _errs138 = errors;
if(typeof data53.cwd !== "string"){
const err95 = {instancePath:instancePath+"/target/cwd",schemaPath:"#/definitions/ProcessInfo/properties/cwd/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
var valid19 = _errs138 === errors;
}
else {
var valid19 = true;
}
if(valid19){
if(data53.foreground !== undefined){
let data56 = data53.foreground;
const _errs140 = errors;
if((typeof data56 !== "string") && (data56 !== null)){
const err96 = {instancePath:instancePath+"/target/foreground",schemaPath:"#/definitions/ProcessInfo/properties/foreground/type",keyword:"type",params:{type: schema56.properties.foreground.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
var valid19 = _errs140 === errors;
}
else {
var valid19 = true;
}
if(valid19){
if(data53.pid !== undefined){
let data57 = data53.pid;
const _errs142 = errors;
if((!(((typeof data57 == "number") && (!(data57 % 1) && !isNaN(data57))) && (isFinite(data57)))) && (data57 !== null)){
const err97 = {instancePath:instancePath+"/target/pid",schemaPath:"#/definitions/ProcessInfo/properties/pid/type",keyword:"type",params:{type: schema56.properties.pid.type},message:"must be integer,null"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
if(errors === _errs142){
if((typeof data57 == "number") && (isFinite(data57))){
if(data57 > 4294967295 || isNaN(data57)){
const err98 = {instancePath:instancePath+"/target/pid",schemaPath:"#/definitions/ProcessInfo/properties/pid/maximum",keyword:"maximum",params:{comparison: "<=", limit: 4294967295},message:"must be <= 4294967295"};
if(vErrors === null){
vErrors = [err98];
}
else {
vErrors.push(err98);
}
errors++;
}
else {
if(data57 < 0 || isNaN(data57)){
const err99 = {instancePath:instancePath+"/target/pid",schemaPath:"#/definitions/ProcessInfo/properties/pid/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err99];
}
else {
vErrors.push(err99);
}
errors++;
}
}
}
}
var valid19 = _errs142 === errors;
}
else {
var valid19 = true;
}
if(valid19){
if(data53.state !== undefined){
const _errs144 = errors;
if(typeof data53.state !== "string"){
const err100 = {instancePath:instancePath+"/target/state",schemaPath:"#/definitions/ProcessInfo/properties/state/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err100];
}
else {
vErrors.push(err100);
}
errors++;
}
var valid19 = _errs144 === errors;
}
else {
var valid19 = true;
}
if(valid19){
if(data53.terminalId !== undefined){
const _errs146 = errors;
if(typeof data53.terminalId !== "string"){
const err101 = {instancePath:instancePath+"/target/terminalId",schemaPath:"#/definitions/ProcessInfo/properties/terminalId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err101];
}
else {
vErrors.push(err101);
}
errors++;
}
var valid19 = _errs146 === errors;
}
else {
var valid19 = true;
}
}
}
}
}
}
}
}
}
else {
const err102 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/ProcessInfo/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err102];
}
else {
vErrors.push(err102);
}
errors++;
}
}
var valid15 = _errs132 === errors;
}
else {
var valid15 = true;
}
}
}
}
}
}
else {
const err103 = {instancePath,schemaPath:"#/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err103];
}
else {
vErrors.push(err103);
}
errors++;
}
}
var _valid0 = _errs111 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 4];
}
else {
if(_valid0){
valid0 = true;
passing0 = 4;
}
}
}
}
}
if(!valid0){
const err104 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err104];
}
else {
vErrors.push(err104);
}
errors++;
validate35.errors = vErrors;
return false;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate35.errors = vErrors;
return errors === 0;
}


function validate34(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((((data.requestId === undefined) && (missing0 = "requestId")) || ((data.status === undefined) && (missing0 = "status"))) || ((data.version === undefined) && (missing0 = "version"))) || ((data.fresh === undefined) && (missing0 = "fresh"))){
validate34.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((((((key0 === "fresh") || (key0 === "message")) || (key0 === "output")) || (key0 === "requestId")) || (key0 === "status")) || (key0 === "version"))){
validate34.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.fresh !== undefined){
const _errs2 = errors;
if(typeof data.fresh !== "boolean"){
validate34.errors = [{instancePath:instancePath+"/fresh",schemaPath:"#/properties/fresh/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"}];
return false;
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.message !== undefined){
let data1 = data.message;
const _errs4 = errors;
if((typeof data1 !== "string") && (data1 !== null)){
validate34.errors = [{instancePath:instancePath+"/message",schemaPath:"#/properties/message/type",keyword:"type",params:{type: schema54.properties.message.type},message:"must be string,null"}];
return false;
}
var valid0 = _errs4 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.output !== undefined){
let data2 = data.output;
const _errs6 = errors;
const _errs7 = errors;
let valid1 = false;
const _errs8 = errors;
if(!(validate35(data2, {instancePath:instancePath+"/output",parentData:data,parentDataProperty:"output",rootData}))){
vErrors = vErrors === null ? validate35.errors : vErrors.concat(validate35.errors);
errors = vErrors.length;
}
var _valid0 = _errs8 === errors;
valid1 = valid1 || _valid0;
if(!valid1){
const _errs9 = errors;
if(data2 !== null){
const err0 = {instancePath:instancePath+"/output",schemaPath:"#/properties/output/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
var _valid0 = _errs9 === errors;
valid1 = valid1 || _valid0;
}
if(!valid1){
const err1 = {instancePath:instancePath+"/output",schemaPath:"#/properties/output/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
validate34.errors = vErrors;
return false;
}
else {
errors = _errs7;
if(vErrors !== null){
if(_errs7){
vErrors.length = _errs7;
}
else {
vErrors = null;
}
}
}
var valid0 = _errs6 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.requestId !== undefined){
const _errs11 = errors;
if(typeof data.requestId !== "string"){
validate34.errors = [{instancePath:instancePath+"/requestId",schemaPath:"#/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs11 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.status !== undefined){
let data4 = data.status;
const _errs13 = errors;
if(typeof data4 !== "string"){
validate34.errors = [{instancePath:instancePath+"/status",schemaPath:"#/definitions/Status/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!(((data4 === "applied") || (data4 === "rejected")) || (data4 === "uncertain"))){
validate34.errors = [{instancePath:instancePath+"/status",schemaPath:"#/definitions/Status/enum",keyword:"enum",params:{allowedValues: schema62.enum},message:"must be equal to one of the allowed values"}];
return false;
}
var valid0 = _errs13 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.version !== undefined){
const _errs16 = errors;
if(typeof data.version !== "string"){
validate34.errors = [{instancePath:instancePath+"/version",schemaPath:"#/properties/version/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs16 === errors;
}
else {
var valid0 = true;
}
}
}
}
}
}
}
}
}
else {
validate34.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate34.errors = vErrors;
return errors === 0;
}

export const processTool = validate37;
const schema63 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"definitions":{"ProcessAction":{"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"list","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"lines":{"maximum":160,"minimum":0,"type":"integer"},"operation":{"const":"read","type":"string"},"terminalId":{"type":"string"}},"required":["operation","contentId","terminalId","lines"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"send","type":"string"},"pid":{"maximum":4294967295,"minimum":0,"type":"integer"},"terminalId":{"type":"string"},"text":{"type":"string"}},"required":["operation","contentId","terminalId","pid","text"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"interrupt","type":"string"},"pid":{"maximum":4294967295,"minimum":0,"type":"integer"},"terminalId":{"type":"string"}},"required":["operation","contentId","terminalId","pid"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"stop","type":"string"},"pid":{"maximum":4294967295,"minimum":0,"type":"integer"},"terminalId":{"type":"string"}},"required":["operation","contentId","terminalId","pid"],"type":"object"}]}},"properties":{"action":{"$ref":"#/definitions/ProcessAction"},"expectedVersion":{"type":"string"}},"required":["expectedVersion","action"],"title":"ProcessInput","type":"object"};
const schema64 = {"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"list","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"lines":{"maximum":160,"minimum":0,"type":"integer"},"operation":{"const":"read","type":"string"},"terminalId":{"type":"string"}},"required":["operation","contentId","terminalId","lines"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"send","type":"string"},"pid":{"maximum":4294967295,"minimum":0,"type":"integer"},"terminalId":{"type":"string"},"text":{"type":"string"}},"required":["operation","contentId","terminalId","pid","text"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"interrupt","type":"string"},"pid":{"maximum":4294967295,"minimum":0,"type":"integer"},"terminalId":{"type":"string"}},"required":["operation","contentId","terminalId","pid"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"stop","type":"string"},"pid":{"maximum":4294967295,"minimum":0,"type":"integer"},"terminalId":{"type":"string"}},"required":["operation","contentId","terminalId","pid"],"type":"object"}]};

function validate37(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((data.expectedVersion === undefined) && (missing0 = "expectedVersion")) || ((data.action === undefined) && (missing0 = "action"))){
validate37.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((key0 === "action") || (key0 === "expectedVersion"))){
validate37.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.action !== undefined){
let data0 = data.action;
const _errs2 = errors;
const _errs4 = errors;
let valid2 = false;
let passing0 = null;
const _errs5 = errors;
if(errors === _errs5){
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
let missing1;
if((data0.operation === undefined) && (missing1 = "operation")){
const err0 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf/0/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
else {
const _errs7 = errors;
for(const key1 in data0){
if(!(key1 === "operation")){
const err1 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
break;
}
}
if(_errs7 === errors){
if(data0.operation !== undefined){
let data1 = data0.operation;
if(typeof data1 !== "string"){
const err2 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/ProcessAction/oneOf/0/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if("list" !== data1){
const err3 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/ProcessAction/oneOf/0/properties/operation/const",keyword:"const",params:{allowedValue: "list"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
}
}
}
else {
const err4 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
var _valid0 = _errs5 === errors;
if(_valid0){
valid2 = true;
passing0 = 0;
}
const _errs10 = errors;
if(errors === _errs10){
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
let missing2;
if(((((data0.operation === undefined) && (missing2 = "operation")) || ((data0.contentId === undefined) && (missing2 = "contentId"))) || ((data0.terminalId === undefined) && (missing2 = "terminalId"))) || ((data0.lines === undefined) && (missing2 = "lines"))){
const err5 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf/1/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
else {
const _errs12 = errors;
for(const key2 in data0){
if(!((((key2 === "contentId") || (key2 === "lines")) || (key2 === "operation")) || (key2 === "terminalId"))){
const err6 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
break;
}
}
if(_errs12 === errors){
if(data0.contentId !== undefined){
const _errs13 = errors;
if(typeof data0.contentId !== "string"){
const err7 = {instancePath:instancePath+"/action/contentId",schemaPath:"#/definitions/ProcessAction/oneOf/1/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
var valid4 = _errs13 === errors;
}
else {
var valid4 = true;
}
if(valid4){
if(data0.lines !== undefined){
let data3 = data0.lines;
const _errs15 = errors;
if(!(((typeof data3 == "number") && (!(data3 % 1) && !isNaN(data3))) && (isFinite(data3)))){
const err8 = {instancePath:instancePath+"/action/lines",schemaPath:"#/definitions/ProcessAction/oneOf/1/properties/lines/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(errors === _errs15){
if((typeof data3 == "number") && (isFinite(data3))){
if(data3 > 160 || isNaN(data3)){
const err9 = {instancePath:instancePath+"/action/lines",schemaPath:"#/definitions/ProcessAction/oneOf/1/properties/lines/maximum",keyword:"maximum",params:{comparison: "<=", limit: 160},message:"must be <= 160"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
else {
if(data3 < 0 || isNaN(data3)){
const err10 = {instancePath:instancePath+"/action/lines",schemaPath:"#/definitions/ProcessAction/oneOf/1/properties/lines/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
}
var valid4 = _errs15 === errors;
}
else {
var valid4 = true;
}
if(valid4){
if(data0.operation !== undefined){
let data4 = data0.operation;
const _errs17 = errors;
if(typeof data4 !== "string"){
const err11 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/ProcessAction/oneOf/1/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if("read" !== data4){
const err12 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/ProcessAction/oneOf/1/properties/operation/const",keyword:"const",params:{allowedValue: "read"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
var valid4 = _errs17 === errors;
}
else {
var valid4 = true;
}
if(valid4){
if(data0.terminalId !== undefined){
const _errs19 = errors;
if(typeof data0.terminalId !== "string"){
const err13 = {instancePath:instancePath+"/action/terminalId",schemaPath:"#/definitions/ProcessAction/oneOf/1/properties/terminalId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
var valid4 = _errs19 === errors;
}
else {
var valid4 = true;
}
}
}
}
}
}
}
else {
const err14 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
var _valid0 = _errs10 === errors;
if(_valid0 && valid2){
valid2 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid2 = true;
passing0 = 1;
}
const _errs21 = errors;
if(errors === _errs21){
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
let missing3;
if((((((data0.operation === undefined) && (missing3 = "operation")) || ((data0.contentId === undefined) && (missing3 = "contentId"))) || ((data0.terminalId === undefined) && (missing3 = "terminalId"))) || ((data0.pid === undefined) && (missing3 = "pid"))) || ((data0.text === undefined) && (missing3 = "text"))){
const err15 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf/2/required",keyword:"required",params:{missingProperty: missing3},message:"must have required property '"+missing3+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
else {
const _errs23 = errors;
for(const key3 in data0){
if(!(((((key3 === "contentId") || (key3 === "operation")) || (key3 === "pid")) || (key3 === "terminalId")) || (key3 === "text"))){
const err16 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
break;
}
}
if(_errs23 === errors){
if(data0.contentId !== undefined){
const _errs24 = errors;
if(typeof data0.contentId !== "string"){
const err17 = {instancePath:instancePath+"/action/contentId",schemaPath:"#/definitions/ProcessAction/oneOf/2/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
var valid5 = _errs24 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data0.operation !== undefined){
let data7 = data0.operation;
const _errs26 = errors;
if(typeof data7 !== "string"){
const err18 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/ProcessAction/oneOf/2/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if("send" !== data7){
const err19 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/ProcessAction/oneOf/2/properties/operation/const",keyword:"const",params:{allowedValue: "send"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
var valid5 = _errs26 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data0.pid !== undefined){
let data8 = data0.pid;
const _errs28 = errors;
if(!(((typeof data8 == "number") && (!(data8 % 1) && !isNaN(data8))) && (isFinite(data8)))){
const err20 = {instancePath:instancePath+"/action/pid",schemaPath:"#/definitions/ProcessAction/oneOf/2/properties/pid/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if(errors === _errs28){
if((typeof data8 == "number") && (isFinite(data8))){
if(data8 > 4294967295 || isNaN(data8)){
const err21 = {instancePath:instancePath+"/action/pid",schemaPath:"#/definitions/ProcessAction/oneOf/2/properties/pid/maximum",keyword:"maximum",params:{comparison: "<=", limit: 4294967295},message:"must be <= 4294967295"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
else {
if(data8 < 0 || isNaN(data8)){
const err22 = {instancePath:instancePath+"/action/pid",schemaPath:"#/definitions/ProcessAction/oneOf/2/properties/pid/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
}
}
var valid5 = _errs28 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data0.terminalId !== undefined){
const _errs30 = errors;
if(typeof data0.terminalId !== "string"){
const err23 = {instancePath:instancePath+"/action/terminalId",schemaPath:"#/definitions/ProcessAction/oneOf/2/properties/terminalId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
var valid5 = _errs30 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data0.text !== undefined){
const _errs32 = errors;
if(typeof data0.text !== "string"){
const err24 = {instancePath:instancePath+"/action/text",schemaPath:"#/definitions/ProcessAction/oneOf/2/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
var valid5 = _errs32 === errors;
}
else {
var valid5 = true;
}
}
}
}
}
}
}
}
else {
const err25 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
var _valid0 = _errs21 === errors;
if(_valid0 && valid2){
valid2 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid2 = true;
passing0 = 2;
}
const _errs34 = errors;
if(errors === _errs34){
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
let missing4;
if(((((data0.operation === undefined) && (missing4 = "operation")) || ((data0.contentId === undefined) && (missing4 = "contentId"))) || ((data0.terminalId === undefined) && (missing4 = "terminalId"))) || ((data0.pid === undefined) && (missing4 = "pid"))){
const err26 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf/3/required",keyword:"required",params:{missingProperty: missing4},message:"must have required property '"+missing4+"'"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
else {
const _errs36 = errors;
for(const key4 in data0){
if(!((((key4 === "contentId") || (key4 === "operation")) || (key4 === "pid")) || (key4 === "terminalId"))){
const err27 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
break;
}
}
if(_errs36 === errors){
if(data0.contentId !== undefined){
const _errs37 = errors;
if(typeof data0.contentId !== "string"){
const err28 = {instancePath:instancePath+"/action/contentId",schemaPath:"#/definitions/ProcessAction/oneOf/3/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
var valid6 = _errs37 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data0.operation !== undefined){
let data12 = data0.operation;
const _errs39 = errors;
if(typeof data12 !== "string"){
const err29 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/ProcessAction/oneOf/3/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
if("interrupt" !== data12){
const err30 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/ProcessAction/oneOf/3/properties/operation/const",keyword:"const",params:{allowedValue: "interrupt"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
var valid6 = _errs39 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data0.pid !== undefined){
let data13 = data0.pid;
const _errs41 = errors;
if(!(((typeof data13 == "number") && (!(data13 % 1) && !isNaN(data13))) && (isFinite(data13)))){
const err31 = {instancePath:instancePath+"/action/pid",schemaPath:"#/definitions/ProcessAction/oneOf/3/properties/pid/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
if(errors === _errs41){
if((typeof data13 == "number") && (isFinite(data13))){
if(data13 > 4294967295 || isNaN(data13)){
const err32 = {instancePath:instancePath+"/action/pid",schemaPath:"#/definitions/ProcessAction/oneOf/3/properties/pid/maximum",keyword:"maximum",params:{comparison: "<=", limit: 4294967295},message:"must be <= 4294967295"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
else {
if(data13 < 0 || isNaN(data13)){
const err33 = {instancePath:instancePath+"/action/pid",schemaPath:"#/definitions/ProcessAction/oneOf/3/properties/pid/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
}
}
var valid6 = _errs41 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data0.terminalId !== undefined){
const _errs43 = errors;
if(typeof data0.terminalId !== "string"){
const err34 = {instancePath:instancePath+"/action/terminalId",schemaPath:"#/definitions/ProcessAction/oneOf/3/properties/terminalId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
var valid6 = _errs43 === errors;
}
else {
var valid6 = true;
}
}
}
}
}
}
}
else {
const err35 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
var _valid0 = _errs34 === errors;
if(_valid0 && valid2){
valid2 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid2 = true;
passing0 = 3;
}
const _errs45 = errors;
if(errors === _errs45){
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
let missing5;
if(((((data0.operation === undefined) && (missing5 = "operation")) || ((data0.contentId === undefined) && (missing5 = "contentId"))) || ((data0.terminalId === undefined) && (missing5 = "terminalId"))) || ((data0.pid === undefined) && (missing5 = "pid"))){
const err36 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf/4/required",keyword:"required",params:{missingProperty: missing5},message:"must have required property '"+missing5+"'"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
else {
const _errs47 = errors;
for(const key5 in data0){
if(!((((key5 === "contentId") || (key5 === "operation")) || (key5 === "pid")) || (key5 === "terminalId"))){
const err37 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
break;
}
}
if(_errs47 === errors){
if(data0.contentId !== undefined){
const _errs48 = errors;
if(typeof data0.contentId !== "string"){
const err38 = {instancePath:instancePath+"/action/contentId",schemaPath:"#/definitions/ProcessAction/oneOf/4/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
var valid7 = _errs48 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data0.operation !== undefined){
let data16 = data0.operation;
const _errs50 = errors;
if(typeof data16 !== "string"){
const err39 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/ProcessAction/oneOf/4/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
if("stop" !== data16){
const err40 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/ProcessAction/oneOf/4/properties/operation/const",keyword:"const",params:{allowedValue: "stop"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
var valid7 = _errs50 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data0.pid !== undefined){
let data17 = data0.pid;
const _errs52 = errors;
if(!(((typeof data17 == "number") && (!(data17 % 1) && !isNaN(data17))) && (isFinite(data17)))){
const err41 = {instancePath:instancePath+"/action/pid",schemaPath:"#/definitions/ProcessAction/oneOf/4/properties/pid/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
if(errors === _errs52){
if((typeof data17 == "number") && (isFinite(data17))){
if(data17 > 4294967295 || isNaN(data17)){
const err42 = {instancePath:instancePath+"/action/pid",schemaPath:"#/definitions/ProcessAction/oneOf/4/properties/pid/maximum",keyword:"maximum",params:{comparison: "<=", limit: 4294967295},message:"must be <= 4294967295"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
else {
if(data17 < 0 || isNaN(data17)){
const err43 = {instancePath:instancePath+"/action/pid",schemaPath:"#/definitions/ProcessAction/oneOf/4/properties/pid/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
}
}
var valid7 = _errs52 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data0.terminalId !== undefined){
const _errs54 = errors;
if(typeof data0.terminalId !== "string"){
const err44 = {instancePath:instancePath+"/action/terminalId",schemaPath:"#/definitions/ProcessAction/oneOf/4/properties/terminalId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
var valid7 = _errs54 === errors;
}
else {
var valid7 = true;
}
}
}
}
}
}
}
else {
const err45 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
var _valid0 = _errs45 === errors;
if(_valid0 && valid2){
valid2 = false;
passing0 = [passing0, 4];
}
else {
if(_valid0){
valid2 = true;
passing0 = 4;
}
}
}
}
}
if(!valid2){
const err46 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/ProcessAction/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
validate37.errors = vErrors;
return false;
}
else {
errors = _errs4;
if(vErrors !== null){
if(_errs4){
vErrors.length = _errs4;
}
else {
vErrors = null;
}
}
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.expectedVersion !== undefined){
const _errs56 = errors;
if(typeof data.expectedVersion !== "string"){
validate37.errors = [{instancePath:instancePath+"/expectedVersion",schemaPath:"#/properties/expectedVersion/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs56 === errors;
}
else {
var valid0 = true;
}
}
}
}
}
else {
validate37.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate37.errors = vErrors;
return errors === 0;
}

export const request = validate38;
const schema65 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"definitions":{"Action":{"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"inspect","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"home","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"name":{"type":"string"},"operation":{"const":"save-layout","type":"string"}},"required":["operation","fleet","name"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"name":{"type":"string"},"operation":{"const":"load-layout","type":"string"}},"required":["operation","fleet","name"],"type":"object"},{"additionalProperties":false,"properties":{"cwd":{"type":"string"},"name":{"type":"string"},"operation":{"const":"create-voyage","type":"string"}},"required":["operation","name","cwd"],"type":"object"},{"additionalProperties":false,"properties":{"name":{"type":"string"},"operation":{"const":"create-fleet","type":"string"},"voyage":{"type":"string"}},"required":["operation","voyage","name"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"create-portal","type":"string"},"voyage":{"type":"string"}},"required":["operation","voyage"],"type":"object"},{"additionalProperties":false,"properties":{"destination":{"$ref":"#/definitions/ContentDestination"},"operation":{"const":"create-content","type":"string"},"typeId":{"type":"string"}},"required":["operation","typeId","destination"],"type":"object"},{"additionalProperties":false,"properties":{"name":{"type":"string"},"operation":{"const":"rename","type":"string"},"target":{"$ref":"#/definitions/RenameTarget"}},"required":["operation","target","name"],"type":"object"},{"additionalProperties":false,"properties":{"after":{"type":"string"},"axis":{"$ref":"#/definitions/Axis"},"fleet":{"type":"string"},"operation":{"const":"split","type":"string"}},"required":["operation","fleet","after","axis"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"operation":{"const":"resize-split","type":"string"},"path":{"items":{"$ref":"#/definitions/SplitChild"},"maxItems":128,"type":"array"},"share":{"$ref":"#/definitions/SplitShare"}},"required":["operation","fleet","path","share"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"move-vessel","type":"string"},"side":{"$ref":"#/definitions/Side"},"target":{"type":"string"}},"required":["operation","id","target","side"],"type":"object"},{"additionalProperties":false,"properties":{"before":{"type":"boolean"},"id":{"type":"string"},"operation":{"const":"move-voyage","type":"string"},"target":{"type":"string"}},"required":["operation","id","target","before"],"type":"object"},{"additionalProperties":false,"properties":{"before":{"type":"boolean"},"id":{"type":"string"},"operation":{"const":"move-fleet","type":"string"},"target":{"type":"string"}},"required":["operation","id","target","before"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"select-voyage","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"select-fleet","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"reveal-vessel","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"context":{"$ref":"#/definitions/Context"},"operation":{"const":"dock","type":"string"}},"required":["operation","context"],"type":"object"}]},"Axis":{"enum":["horizontal","vertical"],"type":"string"},"ContentDestination":{"oneOf":[{"additionalProperties":false,"properties":{"after":{"type":"string"},"axis":{"$ref":"#/definitions/Axis"},"fleet":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","fleet","after","axis"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"portal","type":"string"},"voyage":{"type":"string"}},"required":["kind","voyage"],"type":"object"}]},"Context":{"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"workspace","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]},"RenameTarget":{"oneOf":[{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]},"Side":{"enum":["left","right","top","bottom"],"type":"string"},"SplitChild":{"enum":["first","second"],"type":"string"},"SplitShare":{"maximum":9999,"minimum":1,"type":"integer"}},"properties":{"action":{"$ref":"#/definitions/Action"},"expectedVersion":{"type":"string"},"requestId":{"type":"string"}},"required":["requestId","expectedVersion","action"],"title":"Request","type":"object"};
const schema66 = {"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"inspect","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"home","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"name":{"type":"string"},"operation":{"const":"save-layout","type":"string"}},"required":["operation","fleet","name"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"name":{"type":"string"},"operation":{"const":"load-layout","type":"string"}},"required":["operation","fleet","name"],"type":"object"},{"additionalProperties":false,"properties":{"cwd":{"type":"string"},"name":{"type":"string"},"operation":{"const":"create-voyage","type":"string"}},"required":["operation","name","cwd"],"type":"object"},{"additionalProperties":false,"properties":{"name":{"type":"string"},"operation":{"const":"create-fleet","type":"string"},"voyage":{"type":"string"}},"required":["operation","voyage","name"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"create-portal","type":"string"},"voyage":{"type":"string"}},"required":["operation","voyage"],"type":"object"},{"additionalProperties":false,"properties":{"destination":{"$ref":"#/definitions/ContentDestination"},"operation":{"const":"create-content","type":"string"},"typeId":{"type":"string"}},"required":["operation","typeId","destination"],"type":"object"},{"additionalProperties":false,"properties":{"name":{"type":"string"},"operation":{"const":"rename","type":"string"},"target":{"$ref":"#/definitions/RenameTarget"}},"required":["operation","target","name"],"type":"object"},{"additionalProperties":false,"properties":{"after":{"type":"string"},"axis":{"$ref":"#/definitions/Axis"},"fleet":{"type":"string"},"operation":{"const":"split","type":"string"}},"required":["operation","fleet","after","axis"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"operation":{"const":"resize-split","type":"string"},"path":{"items":{"$ref":"#/definitions/SplitChild"},"maxItems":128,"type":"array"},"share":{"$ref":"#/definitions/SplitShare"}},"required":["operation","fleet","path","share"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"move-vessel","type":"string"},"side":{"$ref":"#/definitions/Side"},"target":{"type":"string"}},"required":["operation","id","target","side"],"type":"object"},{"additionalProperties":false,"properties":{"before":{"type":"boolean"},"id":{"type":"string"},"operation":{"const":"move-voyage","type":"string"},"target":{"type":"string"}},"required":["operation","id","target","before"],"type":"object"},{"additionalProperties":false,"properties":{"before":{"type":"boolean"},"id":{"type":"string"},"operation":{"const":"move-fleet","type":"string"},"target":{"type":"string"}},"required":["operation","id","target","before"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"select-voyage","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"select-fleet","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"reveal-vessel","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"context":{"$ref":"#/definitions/Context"},"operation":{"const":"dock","type":"string"}},"required":["operation","context"],"type":"object"}]};
const schema69 = {"oneOf":[{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]};
const schema68 = {"enum":["horizontal","vertical"],"type":"string"};
const schema71 = {"enum":["first","second"],"type":"string"};
const schema72 = {"maximum":9999,"minimum":1,"type":"integer"};
const schema73 = {"enum":["left","right","top","bottom"],"type":"string"};
const schema74 = {"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"workspace","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]};
const schema67 = {"oneOf":[{"additionalProperties":false,"properties":{"after":{"type":"string"},"axis":{"$ref":"#/definitions/Axis"},"fleet":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","fleet","after","axis"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"portal","type":"string"},"voyage":{"type":"string"}},"required":["kind","voyage"],"type":"object"}]};

function validate40(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(errors === _errs1){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((((data.kind === undefined) && (missing0 = "kind")) || ((data.fleet === undefined) && (missing0 = "fleet"))) || ((data.after === undefined) && (missing0 = "after"))) || ((data.axis === undefined) && (missing0 = "axis"))){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
else {
const _errs3 = errors;
for(const key0 in data){
if(!((((key0 === "after") || (key0 === "axis")) || (key0 === "fleet")) || (key0 === "kind"))){
const err1 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
break;
}
}
if(_errs3 === errors){
if(data.after !== undefined){
const _errs4 = errors;
if(typeof data.after !== "string"){
const err2 = {instancePath:instancePath+"/after",schemaPath:"#/oneOf/0/properties/after/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
var valid1 = _errs4 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.axis !== undefined){
let data1 = data.axis;
const _errs6 = errors;
if(typeof data1 !== "string"){
const err3 = {instancePath:instancePath+"/axis",schemaPath:"#/definitions/Axis/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(!((data1 === "horizontal") || (data1 === "vertical"))){
const err4 = {instancePath:instancePath+"/axis",schemaPath:"#/definitions/Axis/enum",keyword:"enum",params:{allowedValues: schema68.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
var valid1 = _errs6 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.fleet !== undefined){
const _errs9 = errors;
if(typeof data.fleet !== "string"){
const err5 = {instancePath:instancePath+"/fleet",schemaPath:"#/oneOf/0/properties/fleet/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
var valid1 = _errs9 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.kind !== undefined){
let data3 = data.kind;
const _errs11 = errors;
if(typeof data3 !== "string"){
const err6 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if("vessel" !== data3){
const err7 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
var valid1 = _errs11 === errors;
}
else {
var valid1 = true;
}
}
}
}
}
}
}
else {
const err8 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
}
const _errs13 = errors;
if(errors === _errs13){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing1;
if(((data.kind === undefined) && (missing1 = "kind")) || ((data.voyage === undefined) && (missing1 = "voyage"))){
const err9 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
else {
const _errs15 = errors;
for(const key1 in data){
if(!((key1 === "kind") || (key1 === "voyage"))){
const err10 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
break;
}
}
if(_errs15 === errors){
if(data.kind !== undefined){
let data4 = data.kind;
const _errs16 = errors;
if(typeof data4 !== "string"){
const err11 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if("portal" !== data4){
const err12 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "portal"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
var valid3 = _errs16 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data.voyage !== undefined){
const _errs18 = errors;
if(typeof data.voyage !== "string"){
const err13 = {instancePath:instancePath+"/voyage",schemaPath:"#/oneOf/1/properties/voyage/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
var valid3 = _errs18 === errors;
}
else {
var valid3 = true;
}
}
}
}
}
else {
const err14 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
var _valid0 = _errs13 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
}
}
if(!valid0){
const err15 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
validate40.errors = vErrors;
return false;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate40.errors = vErrors;
return errors === 0;
}


function validate39(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(errors === _errs1){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((data.operation === undefined) && (missing0 = "operation")){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
else {
const _errs3 = errors;
for(const key0 in data){
if(!(key0 === "operation")){
const err1 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
break;
}
}
if(_errs3 === errors){
if(data.operation !== undefined){
let data0 = data.operation;
if(typeof data0 !== "string"){
const err2 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/0/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if("inspect" !== data0){
const err3 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/0/properties/operation/const",keyword:"const",params:{allowedValue: "inspect"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
}
}
}
else {
const err4 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
}
const _errs6 = errors;
if(errors === _errs6){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing1;
if((data.operation === undefined) && (missing1 = "operation")){
const err5 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
else {
const _errs8 = errors;
for(const key1 in data){
if(!(key1 === "operation")){
const err6 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
break;
}
}
if(_errs8 === errors){
if(data.operation !== undefined){
let data1 = data.operation;
if(typeof data1 !== "string"){
const err7 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/1/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if("home" !== data1){
const err8 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/1/properties/operation/const",keyword:"const",params:{allowedValue: "home"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
}
}
}
else {
const err9 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
var _valid0 = _errs6 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
}
const _errs11 = errors;
if(errors === _errs11){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing2;
if((((data.operation === undefined) && (missing2 = "operation")) || ((data.fleet === undefined) && (missing2 = "fleet"))) || ((data.name === undefined) && (missing2 = "name"))){
const err10 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
else {
const _errs13 = errors;
for(const key2 in data){
if(!(((key2 === "fleet") || (key2 === "name")) || (key2 === "operation"))){
const err11 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
break;
}
}
if(_errs13 === errors){
if(data.fleet !== undefined){
const _errs14 = errors;
if(typeof data.fleet !== "string"){
const err12 = {instancePath:instancePath+"/fleet",schemaPath:"#/oneOf/2/properties/fleet/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
var valid3 = _errs14 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data.name !== undefined){
const _errs16 = errors;
if(typeof data.name !== "string"){
const err13 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/2/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
var valid3 = _errs16 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data.operation !== undefined){
let data4 = data.operation;
const _errs18 = errors;
if(typeof data4 !== "string"){
const err14 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/2/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if("save-layout" !== data4){
const err15 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/2/properties/operation/const",keyword:"const",params:{allowedValue: "save-layout"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
var valid3 = _errs18 === errors;
}
else {
var valid3 = true;
}
}
}
}
}
}
else {
const err16 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
var _valid0 = _errs11 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
}
const _errs20 = errors;
if(errors === _errs20){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing3;
if((((data.operation === undefined) && (missing3 = "operation")) || ((data.fleet === undefined) && (missing3 = "fleet"))) || ((data.name === undefined) && (missing3 = "name"))){
const err17 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: missing3},message:"must have required property '"+missing3+"'"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
else {
const _errs22 = errors;
for(const key3 in data){
if(!(((key3 === "fleet") || (key3 === "name")) || (key3 === "operation"))){
const err18 = {instancePath,schemaPath:"#/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
break;
}
}
if(_errs22 === errors){
if(data.fleet !== undefined){
const _errs23 = errors;
if(typeof data.fleet !== "string"){
const err19 = {instancePath:instancePath+"/fleet",schemaPath:"#/oneOf/3/properties/fleet/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
var valid4 = _errs23 === errors;
}
else {
var valid4 = true;
}
if(valid4){
if(data.name !== undefined){
const _errs25 = errors;
if(typeof data.name !== "string"){
const err20 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/3/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
var valid4 = _errs25 === errors;
}
else {
var valid4 = true;
}
if(valid4){
if(data.operation !== undefined){
let data7 = data.operation;
const _errs27 = errors;
if(typeof data7 !== "string"){
const err21 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/3/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if("load-layout" !== data7){
const err22 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/3/properties/operation/const",keyword:"const",params:{allowedValue: "load-layout"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
var valid4 = _errs27 === errors;
}
else {
var valid4 = true;
}
}
}
}
}
}
else {
const err23 = {instancePath,schemaPath:"#/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
var _valid0 = _errs20 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid0 = true;
passing0 = 3;
}
const _errs29 = errors;
if(errors === _errs29){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing4;
if((((data.operation === undefined) && (missing4 = "operation")) || ((data.name === undefined) && (missing4 = "name"))) || ((data.cwd === undefined) && (missing4 = "cwd"))){
const err24 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: missing4},message:"must have required property '"+missing4+"'"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
else {
const _errs31 = errors;
for(const key4 in data){
if(!(((key4 === "cwd") || (key4 === "name")) || (key4 === "operation"))){
const err25 = {instancePath,schemaPath:"#/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
break;
}
}
if(_errs31 === errors){
if(data.cwd !== undefined){
const _errs32 = errors;
if(typeof data.cwd !== "string"){
const err26 = {instancePath:instancePath+"/cwd",schemaPath:"#/oneOf/4/properties/cwd/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
var valid5 = _errs32 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data.name !== undefined){
const _errs34 = errors;
if(typeof data.name !== "string"){
const err27 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/4/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
var valid5 = _errs34 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data.operation !== undefined){
let data10 = data.operation;
const _errs36 = errors;
if(typeof data10 !== "string"){
const err28 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/4/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if("create-voyage" !== data10){
const err29 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/4/properties/operation/const",keyword:"const",params:{allowedValue: "create-voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
var valid5 = _errs36 === errors;
}
else {
var valid5 = true;
}
}
}
}
}
}
else {
const err30 = {instancePath,schemaPath:"#/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
var _valid0 = _errs29 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 4];
}
else {
if(_valid0){
valid0 = true;
passing0 = 4;
}
const _errs38 = errors;
if(errors === _errs38){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing5;
if((((data.operation === undefined) && (missing5 = "operation")) || ((data.voyage === undefined) && (missing5 = "voyage"))) || ((data.name === undefined) && (missing5 = "name"))){
const err31 = {instancePath,schemaPath:"#/oneOf/5/required",keyword:"required",params:{missingProperty: missing5},message:"must have required property '"+missing5+"'"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
else {
const _errs40 = errors;
for(const key5 in data){
if(!(((key5 === "name") || (key5 === "operation")) || (key5 === "voyage"))){
const err32 = {instancePath,schemaPath:"#/oneOf/5/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
break;
}
}
if(_errs40 === errors){
if(data.name !== undefined){
const _errs41 = errors;
if(typeof data.name !== "string"){
const err33 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/5/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
var valid6 = _errs41 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data.operation !== undefined){
let data12 = data.operation;
const _errs43 = errors;
if(typeof data12 !== "string"){
const err34 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/5/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
if("create-fleet" !== data12){
const err35 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/5/properties/operation/const",keyword:"const",params:{allowedValue: "create-fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
var valid6 = _errs43 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data.voyage !== undefined){
const _errs45 = errors;
if(typeof data.voyage !== "string"){
const err36 = {instancePath:instancePath+"/voyage",schemaPath:"#/oneOf/5/properties/voyage/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
var valid6 = _errs45 === errors;
}
else {
var valid6 = true;
}
}
}
}
}
}
else {
const err37 = {instancePath,schemaPath:"#/oneOf/5/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
var _valid0 = _errs38 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 5];
}
else {
if(_valid0){
valid0 = true;
passing0 = 5;
}
const _errs47 = errors;
if(errors === _errs47){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing6;
if(((data.operation === undefined) && (missing6 = "operation")) || ((data.voyage === undefined) && (missing6 = "voyage"))){
const err38 = {instancePath,schemaPath:"#/oneOf/6/required",keyword:"required",params:{missingProperty: missing6},message:"must have required property '"+missing6+"'"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
else {
const _errs49 = errors;
for(const key6 in data){
if(!((key6 === "operation") || (key6 === "voyage"))){
const err39 = {instancePath,schemaPath:"#/oneOf/6/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
break;
}
}
if(_errs49 === errors){
if(data.operation !== undefined){
let data14 = data.operation;
const _errs50 = errors;
if(typeof data14 !== "string"){
const err40 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/6/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
if("create-portal" !== data14){
const err41 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/6/properties/operation/const",keyword:"const",params:{allowedValue: "create-portal"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
var valid7 = _errs50 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data.voyage !== undefined){
const _errs52 = errors;
if(typeof data.voyage !== "string"){
const err42 = {instancePath:instancePath+"/voyage",schemaPath:"#/oneOf/6/properties/voyage/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
var valid7 = _errs52 === errors;
}
else {
var valid7 = true;
}
}
}
}
}
else {
const err43 = {instancePath,schemaPath:"#/oneOf/6/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
var _valid0 = _errs47 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 6];
}
else {
if(_valid0){
valid0 = true;
passing0 = 6;
}
const _errs54 = errors;
if(errors === _errs54){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing7;
if((((data.operation === undefined) && (missing7 = "operation")) || ((data.typeId === undefined) && (missing7 = "typeId"))) || ((data.destination === undefined) && (missing7 = "destination"))){
const err44 = {instancePath,schemaPath:"#/oneOf/7/required",keyword:"required",params:{missingProperty: missing7},message:"must have required property '"+missing7+"'"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
else {
const _errs56 = errors;
for(const key7 in data){
if(!(((key7 === "destination") || (key7 === "operation")) || (key7 === "typeId"))){
const err45 = {instancePath,schemaPath:"#/oneOf/7/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key7},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
break;
}
}
if(_errs56 === errors){
if(data.destination !== undefined){
const _errs57 = errors;
if(!(validate40(data.destination, {instancePath:instancePath+"/destination",parentData:data,parentDataProperty:"destination",rootData}))){
vErrors = vErrors === null ? validate40.errors : vErrors.concat(validate40.errors);
errors = vErrors.length;
}
var valid8 = _errs57 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data.operation !== undefined){
let data17 = data.operation;
const _errs58 = errors;
if(typeof data17 !== "string"){
const err46 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/7/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
if("create-content" !== data17){
const err47 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/7/properties/operation/const",keyword:"const",params:{allowedValue: "create-content"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
var valid8 = _errs58 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data.typeId !== undefined){
const _errs60 = errors;
if(typeof data.typeId !== "string"){
const err48 = {instancePath:instancePath+"/typeId",schemaPath:"#/oneOf/7/properties/typeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
var valid8 = _errs60 === errors;
}
else {
var valid8 = true;
}
}
}
}
}
}
else {
const err49 = {instancePath,schemaPath:"#/oneOf/7/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
var _valid0 = _errs54 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 7];
}
else {
if(_valid0){
valid0 = true;
passing0 = 7;
}
const _errs62 = errors;
if(errors === _errs62){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing8;
if((((data.operation === undefined) && (missing8 = "operation")) || ((data.target === undefined) && (missing8 = "target"))) || ((data.name === undefined) && (missing8 = "name"))){
const err50 = {instancePath,schemaPath:"#/oneOf/8/required",keyword:"required",params:{missingProperty: missing8},message:"must have required property '"+missing8+"'"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
else {
const _errs64 = errors;
for(const key8 in data){
if(!(((key8 === "name") || (key8 === "operation")) || (key8 === "target"))){
const err51 = {instancePath,schemaPath:"#/oneOf/8/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key8},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
break;
}
}
if(_errs64 === errors){
if(data.name !== undefined){
const _errs65 = errors;
if(typeof data.name !== "string"){
const err52 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/8/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
var valid9 = _errs65 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data.operation !== undefined){
let data20 = data.operation;
const _errs67 = errors;
if(typeof data20 !== "string"){
const err53 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/8/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
if("rename" !== data20){
const err54 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/8/properties/operation/const",keyword:"const",params:{allowedValue: "rename"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
var valid9 = _errs67 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data.target !== undefined){
let data21 = data.target;
const _errs69 = errors;
const _errs71 = errors;
let valid11 = false;
let passing1 = null;
const _errs72 = errors;
if(errors === _errs72){
if(data21 && typeof data21 == "object" && !Array.isArray(data21)){
let missing9;
if(((data21.kind === undefined) && (missing9 = "kind")) || ((data21.id === undefined) && (missing9 = "id"))){
const err55 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/0/required",keyword:"required",params:{missingProperty: missing9},message:"must have required property '"+missing9+"'"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
else {
const _errs74 = errors;
for(const key9 in data21){
if(!((key9 === "id") || (key9 === "kind"))){
const err56 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key9},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
break;
}
}
if(_errs74 === errors){
if(data21.id !== undefined){
const _errs75 = errors;
if(typeof data21.id !== "string"){
const err57 = {instancePath:instancePath+"/target/id",schemaPath:"#/definitions/RenameTarget/oneOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
var valid12 = _errs75 === errors;
}
else {
var valid12 = true;
}
if(valid12){
if(data21.kind !== undefined){
let data23 = data21.kind;
const _errs77 = errors;
if(typeof data23 !== "string"){
const err58 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
if("voyage" !== data23){
const err59 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
var valid12 = _errs77 === errors;
}
else {
var valid12 = true;
}
}
}
}
}
else {
const err60 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
var _valid1 = _errs72 === errors;
if(_valid1){
valid11 = true;
passing1 = 0;
}
const _errs79 = errors;
if(errors === _errs79){
if(data21 && typeof data21 == "object" && !Array.isArray(data21)){
let missing10;
if(((data21.kind === undefined) && (missing10 = "kind")) || ((data21.id === undefined) && (missing10 = "id"))){
const err61 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/1/required",keyword:"required",params:{missingProperty: missing10},message:"must have required property '"+missing10+"'"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
else {
const _errs81 = errors;
for(const key10 in data21){
if(!((key10 === "id") || (key10 === "kind"))){
const err62 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key10},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
break;
}
}
if(_errs81 === errors){
if(data21.id !== undefined){
const _errs82 = errors;
if(typeof data21.id !== "string"){
const err63 = {instancePath:instancePath+"/target/id",schemaPath:"#/definitions/RenameTarget/oneOf/1/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
var valid13 = _errs82 === errors;
}
else {
var valid13 = true;
}
if(valid13){
if(data21.kind !== undefined){
let data25 = data21.kind;
const _errs84 = errors;
if(typeof data25 !== "string"){
const err64 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
if("fleet" !== data25){
const err65 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
var valid13 = _errs84 === errors;
}
else {
var valid13 = true;
}
}
}
}
}
else {
const err66 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
}
var _valid1 = _errs79 === errors;
if(_valid1 && valid11){
valid11 = false;
passing1 = [passing1, 1];
}
else {
if(_valid1){
valid11 = true;
passing1 = 1;
}
const _errs86 = errors;
if(errors === _errs86){
if(data21 && typeof data21 == "object" && !Array.isArray(data21)){
let missing11;
if(((data21.kind === undefined) && (missing11 = "kind")) || ((data21.id === undefined) && (missing11 = "id"))){
const err67 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/2/required",keyword:"required",params:{missingProperty: missing11},message:"must have required property '"+missing11+"'"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
else {
const _errs88 = errors;
for(const key11 in data21){
if(!((key11 === "id") || (key11 === "kind"))){
const err68 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key11},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
break;
}
}
if(_errs88 === errors){
if(data21.id !== undefined){
const _errs89 = errors;
if(typeof data21.id !== "string"){
const err69 = {instancePath:instancePath+"/target/id",schemaPath:"#/definitions/RenameTarget/oneOf/2/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
var valid14 = _errs89 === errors;
}
else {
var valid14 = true;
}
if(valid14){
if(data21.kind !== undefined){
let data27 = data21.kind;
const _errs91 = errors;
if(typeof data27 !== "string"){
const err70 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
if("vessel" !== data27){
const err71 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
var valid14 = _errs91 === errors;
}
else {
var valid14 = true;
}
}
}
}
}
else {
const err72 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
}
var _valid1 = _errs86 === errors;
if(_valid1 && valid11){
valid11 = false;
passing1 = [passing1, 2];
}
else {
if(_valid1){
valid11 = true;
passing1 = 2;
}
const _errs93 = errors;
if(errors === _errs93){
if(data21 && typeof data21 == "object" && !Array.isArray(data21)){
let missing12;
if(((data21.kind === undefined) && (missing12 = "kind")) || ((data21.id === undefined) && (missing12 = "id"))){
const err73 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/3/required",keyword:"required",params:{missingProperty: missing12},message:"must have required property '"+missing12+"'"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
else {
const _errs95 = errors;
for(const key12 in data21){
if(!((key12 === "id") || (key12 === "kind"))){
const err74 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key12},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
break;
}
}
if(_errs95 === errors){
if(data21.id !== undefined){
const _errs96 = errors;
if(typeof data21.id !== "string"){
const err75 = {instancePath:instancePath+"/target/id",schemaPath:"#/definitions/RenameTarget/oneOf/3/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
var valid15 = _errs96 === errors;
}
else {
var valid15 = true;
}
if(valid15){
if(data21.kind !== undefined){
let data29 = data21.kind;
const _errs98 = errors;
if(typeof data29 !== "string"){
const err76 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/3/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
if("portal" !== data29){
const err77 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/3/properties/kind/const",keyword:"const",params:{allowedValue: "portal"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
var valid15 = _errs98 === errors;
}
else {
var valid15 = true;
}
}
}
}
}
else {
const err78 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
}
var _valid1 = _errs93 === errors;
if(_valid1 && valid11){
valid11 = false;
passing1 = [passing1, 3];
}
else {
if(_valid1){
valid11 = true;
passing1 = 3;
}
}
}
}
if(!valid11){
const err79 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf",keyword:"oneOf",params:{passingSchemas: passing1},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
else {
errors = _errs71;
if(vErrors !== null){
if(_errs71){
vErrors.length = _errs71;
}
else {
vErrors = null;
}
}
}
var valid9 = _errs69 === errors;
}
else {
var valid9 = true;
}
}
}
}
}
}
else {
const err80 = {instancePath,schemaPath:"#/oneOf/8/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
}
var _valid0 = _errs62 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 8];
}
else {
if(_valid0){
valid0 = true;
passing0 = 8;
}
const _errs100 = errors;
if(errors === _errs100){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing13;
if(((((data.operation === undefined) && (missing13 = "operation")) || ((data.fleet === undefined) && (missing13 = "fleet"))) || ((data.after === undefined) && (missing13 = "after"))) || ((data.axis === undefined) && (missing13 = "axis"))){
const err81 = {instancePath,schemaPath:"#/oneOf/9/required",keyword:"required",params:{missingProperty: missing13},message:"must have required property '"+missing13+"'"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
else {
const _errs102 = errors;
for(const key13 in data){
if(!((((key13 === "after") || (key13 === "axis")) || (key13 === "fleet")) || (key13 === "operation"))){
const err82 = {instancePath,schemaPath:"#/oneOf/9/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key13},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
break;
}
}
if(_errs102 === errors){
if(data.after !== undefined){
const _errs103 = errors;
if(typeof data.after !== "string"){
const err83 = {instancePath:instancePath+"/after",schemaPath:"#/oneOf/9/properties/after/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
var valid16 = _errs103 === errors;
}
else {
var valid16 = true;
}
if(valid16){
if(data.axis !== undefined){
let data31 = data.axis;
const _errs105 = errors;
if(typeof data31 !== "string"){
const err84 = {instancePath:instancePath+"/axis",schemaPath:"#/definitions/Axis/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
if(!((data31 === "horizontal") || (data31 === "vertical"))){
const err85 = {instancePath:instancePath+"/axis",schemaPath:"#/definitions/Axis/enum",keyword:"enum",params:{allowedValues: schema68.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
var valid16 = _errs105 === errors;
}
else {
var valid16 = true;
}
if(valid16){
if(data.fleet !== undefined){
const _errs108 = errors;
if(typeof data.fleet !== "string"){
const err86 = {instancePath:instancePath+"/fleet",schemaPath:"#/oneOf/9/properties/fleet/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
var valid16 = _errs108 === errors;
}
else {
var valid16 = true;
}
if(valid16){
if(data.operation !== undefined){
let data33 = data.operation;
const _errs110 = errors;
if(typeof data33 !== "string"){
const err87 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/9/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
if("split" !== data33){
const err88 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/9/properties/operation/const",keyword:"const",params:{allowedValue: "split"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
var valid16 = _errs110 === errors;
}
else {
var valid16 = true;
}
}
}
}
}
}
}
else {
const err89 = {instancePath,schemaPath:"#/oneOf/9/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
}
var _valid0 = _errs100 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 9];
}
else {
if(_valid0){
valid0 = true;
passing0 = 9;
}
const _errs112 = errors;
if(errors === _errs112){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing14;
if(((((data.operation === undefined) && (missing14 = "operation")) || ((data.fleet === undefined) && (missing14 = "fleet"))) || ((data.path === undefined) && (missing14 = "path"))) || ((data.share === undefined) && (missing14 = "share"))){
const err90 = {instancePath,schemaPath:"#/oneOf/10/required",keyword:"required",params:{missingProperty: missing14},message:"must have required property '"+missing14+"'"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
else {
const _errs114 = errors;
for(const key14 in data){
if(!((((key14 === "fleet") || (key14 === "operation")) || (key14 === "path")) || (key14 === "share"))){
const err91 = {instancePath,schemaPath:"#/oneOf/10/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key14},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
break;
}
}
if(_errs114 === errors){
if(data.fleet !== undefined){
const _errs115 = errors;
if(typeof data.fleet !== "string"){
const err92 = {instancePath:instancePath+"/fleet",schemaPath:"#/oneOf/10/properties/fleet/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
var valid18 = _errs115 === errors;
}
else {
var valid18 = true;
}
if(valid18){
if(data.operation !== undefined){
let data35 = data.operation;
const _errs117 = errors;
if(typeof data35 !== "string"){
const err93 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/10/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err93];
}
else {
vErrors.push(err93);
}
errors++;
}
if("resize-split" !== data35){
const err94 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/10/properties/operation/const",keyword:"const",params:{allowedValue: "resize-split"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
var valid18 = _errs117 === errors;
}
else {
var valid18 = true;
}
if(valid18){
if(data.path !== undefined){
let data36 = data.path;
const _errs119 = errors;
if(errors === _errs119){
if(Array.isArray(data36)){
if(data36.length > 128){
const err95 = {instancePath:instancePath+"/path",schemaPath:"#/oneOf/10/properties/path/maxItems",keyword:"maxItems",params:{limit: 128},message:"must NOT have more than 128 items"};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
else {
var valid19 = true;
const len0 = data36.length;
for(let i0=0; i0<len0; i0++){
let data37 = data36[i0];
const _errs121 = errors;
if(typeof data37 !== "string"){
const err96 = {instancePath:instancePath+"/path/" + i0,schemaPath:"#/definitions/SplitChild/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
if(!((data37 === "first") || (data37 === "second"))){
const err97 = {instancePath:instancePath+"/path/" + i0,schemaPath:"#/definitions/SplitChild/enum",keyword:"enum",params:{allowedValues: schema71.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
var valid19 = _errs121 === errors;
if(!valid19){
break;
}
}
}
}
else {
const err98 = {instancePath:instancePath+"/path",schemaPath:"#/oneOf/10/properties/path/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err98];
}
else {
vErrors.push(err98);
}
errors++;
}
}
var valid18 = _errs119 === errors;
}
else {
var valid18 = true;
}
if(valid18){
if(data.share !== undefined){
let data38 = data.share;
const _errs124 = errors;
const _errs125 = errors;
if(!(((typeof data38 == "number") && (!(data38 % 1) && !isNaN(data38))) && (isFinite(data38)))){
const err99 = {instancePath:instancePath+"/share",schemaPath:"#/definitions/SplitShare/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err99];
}
else {
vErrors.push(err99);
}
errors++;
}
if(errors === _errs125){
if((typeof data38 == "number") && (isFinite(data38))){
if(data38 > 9999 || isNaN(data38)){
const err100 = {instancePath:instancePath+"/share",schemaPath:"#/definitions/SplitShare/maximum",keyword:"maximum",params:{comparison: "<=", limit: 9999},message:"must be <= 9999"};
if(vErrors === null){
vErrors = [err100];
}
else {
vErrors.push(err100);
}
errors++;
}
else {
if(data38 < 1 || isNaN(data38)){
const err101 = {instancePath:instancePath+"/share",schemaPath:"#/definitions/SplitShare/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err101];
}
else {
vErrors.push(err101);
}
errors++;
}
}
}
}
var valid18 = _errs124 === errors;
}
else {
var valid18 = true;
}
}
}
}
}
}
}
else {
const err102 = {instancePath,schemaPath:"#/oneOf/10/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err102];
}
else {
vErrors.push(err102);
}
errors++;
}
}
var _valid0 = _errs112 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 10];
}
else {
if(_valid0){
valid0 = true;
passing0 = 10;
}
const _errs127 = errors;
if(errors === _errs127){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing15;
if(((((data.operation === undefined) && (missing15 = "operation")) || ((data.id === undefined) && (missing15 = "id"))) || ((data.target === undefined) && (missing15 = "target"))) || ((data.side === undefined) && (missing15 = "side"))){
const err103 = {instancePath,schemaPath:"#/oneOf/11/required",keyword:"required",params:{missingProperty: missing15},message:"must have required property '"+missing15+"'"};
if(vErrors === null){
vErrors = [err103];
}
else {
vErrors.push(err103);
}
errors++;
}
else {
const _errs129 = errors;
for(const key15 in data){
if(!((((key15 === "id") || (key15 === "operation")) || (key15 === "side")) || (key15 === "target"))){
const err104 = {instancePath,schemaPath:"#/oneOf/11/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key15},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err104];
}
else {
vErrors.push(err104);
}
errors++;
break;
}
}
if(_errs129 === errors){
if(data.id !== undefined){
const _errs130 = errors;
if(typeof data.id !== "string"){
const err105 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/11/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err105];
}
else {
vErrors.push(err105);
}
errors++;
}
var valid22 = _errs130 === errors;
}
else {
var valid22 = true;
}
if(valid22){
if(data.operation !== undefined){
let data40 = data.operation;
const _errs132 = errors;
if(typeof data40 !== "string"){
const err106 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/11/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err106];
}
else {
vErrors.push(err106);
}
errors++;
}
if("move-vessel" !== data40){
const err107 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/11/properties/operation/const",keyword:"const",params:{allowedValue: "move-vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err107];
}
else {
vErrors.push(err107);
}
errors++;
}
var valid22 = _errs132 === errors;
}
else {
var valid22 = true;
}
if(valid22){
if(data.side !== undefined){
let data41 = data.side;
const _errs134 = errors;
if(typeof data41 !== "string"){
const err108 = {instancePath:instancePath+"/side",schemaPath:"#/definitions/Side/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err108];
}
else {
vErrors.push(err108);
}
errors++;
}
if(!((((data41 === "left") || (data41 === "right")) || (data41 === "top")) || (data41 === "bottom"))){
const err109 = {instancePath:instancePath+"/side",schemaPath:"#/definitions/Side/enum",keyword:"enum",params:{allowedValues: schema73.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err109];
}
else {
vErrors.push(err109);
}
errors++;
}
var valid22 = _errs134 === errors;
}
else {
var valid22 = true;
}
if(valid22){
if(data.target !== undefined){
const _errs137 = errors;
if(typeof data.target !== "string"){
const err110 = {instancePath:instancePath+"/target",schemaPath:"#/oneOf/11/properties/target/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err110];
}
else {
vErrors.push(err110);
}
errors++;
}
var valid22 = _errs137 === errors;
}
else {
var valid22 = true;
}
}
}
}
}
}
}
else {
const err111 = {instancePath,schemaPath:"#/oneOf/11/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err111];
}
else {
vErrors.push(err111);
}
errors++;
}
}
var _valid0 = _errs127 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 11];
}
else {
if(_valid0){
valid0 = true;
passing0 = 11;
}
const _errs139 = errors;
if(errors === _errs139){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing16;
if(((((data.operation === undefined) && (missing16 = "operation")) || ((data.id === undefined) && (missing16 = "id"))) || ((data.target === undefined) && (missing16 = "target"))) || ((data.before === undefined) && (missing16 = "before"))){
const err112 = {instancePath,schemaPath:"#/oneOf/12/required",keyword:"required",params:{missingProperty: missing16},message:"must have required property '"+missing16+"'"};
if(vErrors === null){
vErrors = [err112];
}
else {
vErrors.push(err112);
}
errors++;
}
else {
const _errs141 = errors;
for(const key16 in data){
if(!((((key16 === "before") || (key16 === "id")) || (key16 === "operation")) || (key16 === "target"))){
const err113 = {instancePath,schemaPath:"#/oneOf/12/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key16},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err113];
}
else {
vErrors.push(err113);
}
errors++;
break;
}
}
if(_errs141 === errors){
if(data.before !== undefined){
const _errs142 = errors;
if(typeof data.before !== "boolean"){
const err114 = {instancePath:instancePath+"/before",schemaPath:"#/oneOf/12/properties/before/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err114];
}
else {
vErrors.push(err114);
}
errors++;
}
var valid24 = _errs142 === errors;
}
else {
var valid24 = true;
}
if(valid24){
if(data.id !== undefined){
const _errs144 = errors;
if(typeof data.id !== "string"){
const err115 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/12/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err115];
}
else {
vErrors.push(err115);
}
errors++;
}
var valid24 = _errs144 === errors;
}
else {
var valid24 = true;
}
if(valid24){
if(data.operation !== undefined){
let data45 = data.operation;
const _errs146 = errors;
if(typeof data45 !== "string"){
const err116 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/12/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err116];
}
else {
vErrors.push(err116);
}
errors++;
}
if("move-voyage" !== data45){
const err117 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/12/properties/operation/const",keyword:"const",params:{allowedValue: "move-voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err117];
}
else {
vErrors.push(err117);
}
errors++;
}
var valid24 = _errs146 === errors;
}
else {
var valid24 = true;
}
if(valid24){
if(data.target !== undefined){
const _errs148 = errors;
if(typeof data.target !== "string"){
const err118 = {instancePath:instancePath+"/target",schemaPath:"#/oneOf/12/properties/target/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err118];
}
else {
vErrors.push(err118);
}
errors++;
}
var valid24 = _errs148 === errors;
}
else {
var valid24 = true;
}
}
}
}
}
}
}
else {
const err119 = {instancePath,schemaPath:"#/oneOf/12/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err119];
}
else {
vErrors.push(err119);
}
errors++;
}
}
var _valid0 = _errs139 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 12];
}
else {
if(_valid0){
valid0 = true;
passing0 = 12;
}
const _errs150 = errors;
if(errors === _errs150){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing17;
if(((((data.operation === undefined) && (missing17 = "operation")) || ((data.id === undefined) && (missing17 = "id"))) || ((data.target === undefined) && (missing17 = "target"))) || ((data.before === undefined) && (missing17 = "before"))){
const err120 = {instancePath,schemaPath:"#/oneOf/13/required",keyword:"required",params:{missingProperty: missing17},message:"must have required property '"+missing17+"'"};
if(vErrors === null){
vErrors = [err120];
}
else {
vErrors.push(err120);
}
errors++;
}
else {
const _errs152 = errors;
for(const key17 in data){
if(!((((key17 === "before") || (key17 === "id")) || (key17 === "operation")) || (key17 === "target"))){
const err121 = {instancePath,schemaPath:"#/oneOf/13/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key17},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err121];
}
else {
vErrors.push(err121);
}
errors++;
break;
}
}
if(_errs152 === errors){
if(data.before !== undefined){
const _errs153 = errors;
if(typeof data.before !== "boolean"){
const err122 = {instancePath:instancePath+"/before",schemaPath:"#/oneOf/13/properties/before/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err122];
}
else {
vErrors.push(err122);
}
errors++;
}
var valid25 = _errs153 === errors;
}
else {
var valid25 = true;
}
if(valid25){
if(data.id !== undefined){
const _errs155 = errors;
if(typeof data.id !== "string"){
const err123 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/13/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err123];
}
else {
vErrors.push(err123);
}
errors++;
}
var valid25 = _errs155 === errors;
}
else {
var valid25 = true;
}
if(valid25){
if(data.operation !== undefined){
let data49 = data.operation;
const _errs157 = errors;
if(typeof data49 !== "string"){
const err124 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/13/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err124];
}
else {
vErrors.push(err124);
}
errors++;
}
if("move-fleet" !== data49){
const err125 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/13/properties/operation/const",keyword:"const",params:{allowedValue: "move-fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err125];
}
else {
vErrors.push(err125);
}
errors++;
}
var valid25 = _errs157 === errors;
}
else {
var valid25 = true;
}
if(valid25){
if(data.target !== undefined){
const _errs159 = errors;
if(typeof data.target !== "string"){
const err126 = {instancePath:instancePath+"/target",schemaPath:"#/oneOf/13/properties/target/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err126];
}
else {
vErrors.push(err126);
}
errors++;
}
var valid25 = _errs159 === errors;
}
else {
var valid25 = true;
}
}
}
}
}
}
}
else {
const err127 = {instancePath,schemaPath:"#/oneOf/13/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err127];
}
else {
vErrors.push(err127);
}
errors++;
}
}
var _valid0 = _errs150 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 13];
}
else {
if(_valid0){
valid0 = true;
passing0 = 13;
}
const _errs161 = errors;
if(errors === _errs161){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing18;
if(((data.operation === undefined) && (missing18 = "operation")) || ((data.id === undefined) && (missing18 = "id"))){
const err128 = {instancePath,schemaPath:"#/oneOf/14/required",keyword:"required",params:{missingProperty: missing18},message:"must have required property '"+missing18+"'"};
if(vErrors === null){
vErrors = [err128];
}
else {
vErrors.push(err128);
}
errors++;
}
else {
const _errs163 = errors;
for(const key18 in data){
if(!((key18 === "id") || (key18 === "operation"))){
const err129 = {instancePath,schemaPath:"#/oneOf/14/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key18},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err129];
}
else {
vErrors.push(err129);
}
errors++;
break;
}
}
if(_errs163 === errors){
if(data.id !== undefined){
const _errs164 = errors;
if(typeof data.id !== "string"){
const err130 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/14/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err130];
}
else {
vErrors.push(err130);
}
errors++;
}
var valid26 = _errs164 === errors;
}
else {
var valid26 = true;
}
if(valid26){
if(data.operation !== undefined){
let data52 = data.operation;
const _errs166 = errors;
if(typeof data52 !== "string"){
const err131 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/14/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err131];
}
else {
vErrors.push(err131);
}
errors++;
}
if("select-voyage" !== data52){
const err132 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/14/properties/operation/const",keyword:"const",params:{allowedValue: "select-voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err132];
}
else {
vErrors.push(err132);
}
errors++;
}
var valid26 = _errs166 === errors;
}
else {
var valid26 = true;
}
}
}
}
}
else {
const err133 = {instancePath,schemaPath:"#/oneOf/14/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err133];
}
else {
vErrors.push(err133);
}
errors++;
}
}
var _valid0 = _errs161 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 14];
}
else {
if(_valid0){
valid0 = true;
passing0 = 14;
}
const _errs168 = errors;
if(errors === _errs168){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing19;
if(((data.operation === undefined) && (missing19 = "operation")) || ((data.id === undefined) && (missing19 = "id"))){
const err134 = {instancePath,schemaPath:"#/oneOf/15/required",keyword:"required",params:{missingProperty: missing19},message:"must have required property '"+missing19+"'"};
if(vErrors === null){
vErrors = [err134];
}
else {
vErrors.push(err134);
}
errors++;
}
else {
const _errs170 = errors;
for(const key19 in data){
if(!((key19 === "id") || (key19 === "operation"))){
const err135 = {instancePath,schemaPath:"#/oneOf/15/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key19},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err135];
}
else {
vErrors.push(err135);
}
errors++;
break;
}
}
if(_errs170 === errors){
if(data.id !== undefined){
const _errs171 = errors;
if(typeof data.id !== "string"){
const err136 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/15/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err136];
}
else {
vErrors.push(err136);
}
errors++;
}
var valid27 = _errs171 === errors;
}
else {
var valid27 = true;
}
if(valid27){
if(data.operation !== undefined){
let data54 = data.operation;
const _errs173 = errors;
if(typeof data54 !== "string"){
const err137 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/15/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err137];
}
else {
vErrors.push(err137);
}
errors++;
}
if("select-fleet" !== data54){
const err138 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/15/properties/operation/const",keyword:"const",params:{allowedValue: "select-fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err138];
}
else {
vErrors.push(err138);
}
errors++;
}
var valid27 = _errs173 === errors;
}
else {
var valid27 = true;
}
}
}
}
}
else {
const err139 = {instancePath,schemaPath:"#/oneOf/15/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err139];
}
else {
vErrors.push(err139);
}
errors++;
}
}
var _valid0 = _errs168 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 15];
}
else {
if(_valid0){
valid0 = true;
passing0 = 15;
}
const _errs175 = errors;
if(errors === _errs175){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing20;
if(((data.operation === undefined) && (missing20 = "operation")) || ((data.id === undefined) && (missing20 = "id"))){
const err140 = {instancePath,schemaPath:"#/oneOf/16/required",keyword:"required",params:{missingProperty: missing20},message:"must have required property '"+missing20+"'"};
if(vErrors === null){
vErrors = [err140];
}
else {
vErrors.push(err140);
}
errors++;
}
else {
const _errs177 = errors;
for(const key20 in data){
if(!((key20 === "id") || (key20 === "operation"))){
const err141 = {instancePath,schemaPath:"#/oneOf/16/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key20},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err141];
}
else {
vErrors.push(err141);
}
errors++;
break;
}
}
if(_errs177 === errors){
if(data.id !== undefined){
const _errs178 = errors;
if(typeof data.id !== "string"){
const err142 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/16/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err142];
}
else {
vErrors.push(err142);
}
errors++;
}
var valid28 = _errs178 === errors;
}
else {
var valid28 = true;
}
if(valid28){
if(data.operation !== undefined){
let data56 = data.operation;
const _errs180 = errors;
if(typeof data56 !== "string"){
const err143 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/16/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err143];
}
else {
vErrors.push(err143);
}
errors++;
}
if("reveal-vessel" !== data56){
const err144 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/16/properties/operation/const",keyword:"const",params:{allowedValue: "reveal-vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err144];
}
else {
vErrors.push(err144);
}
errors++;
}
var valid28 = _errs180 === errors;
}
else {
var valid28 = true;
}
}
}
}
}
else {
const err145 = {instancePath,schemaPath:"#/oneOf/16/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err145];
}
else {
vErrors.push(err145);
}
errors++;
}
}
var _valid0 = _errs175 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 16];
}
else {
if(_valid0){
valid0 = true;
passing0 = 16;
}
const _errs182 = errors;
if(errors === _errs182){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing21;
if(((data.operation === undefined) && (missing21 = "operation")) || ((data.context === undefined) && (missing21 = "context"))){
const err146 = {instancePath,schemaPath:"#/oneOf/17/required",keyword:"required",params:{missingProperty: missing21},message:"must have required property '"+missing21+"'"};
if(vErrors === null){
vErrors = [err146];
}
else {
vErrors.push(err146);
}
errors++;
}
else {
const _errs184 = errors;
for(const key21 in data){
if(!((key21 === "context") || (key21 === "operation"))){
const err147 = {instancePath,schemaPath:"#/oneOf/17/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key21},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err147];
}
else {
vErrors.push(err147);
}
errors++;
break;
}
}
if(_errs184 === errors){
if(data.context !== undefined){
let data57 = data.context;
const _errs185 = errors;
const _errs187 = errors;
let valid31 = false;
let passing2 = null;
const _errs188 = errors;
if(errors === _errs188){
if(data57 && typeof data57 == "object" && !Array.isArray(data57)){
let missing22;
if((data57.kind === undefined) && (missing22 = "kind")){
const err148 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/0/required",keyword:"required",params:{missingProperty: missing22},message:"must have required property '"+missing22+"'"};
if(vErrors === null){
vErrors = [err148];
}
else {
vErrors.push(err148);
}
errors++;
}
else {
const _errs190 = errors;
for(const key22 in data57){
if(!(key22 === "kind")){
const err149 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key22},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err149];
}
else {
vErrors.push(err149);
}
errors++;
break;
}
}
if(_errs190 === errors){
if(data57.kind !== undefined){
let data58 = data57.kind;
if(typeof data58 !== "string"){
const err150 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err150];
}
else {
vErrors.push(err150);
}
errors++;
}
if("workspace" !== data58){
const err151 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "workspace"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err151];
}
else {
vErrors.push(err151);
}
errors++;
}
}
}
}
}
else {
const err152 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err152];
}
else {
vErrors.push(err152);
}
errors++;
}
}
var _valid2 = _errs188 === errors;
if(_valid2){
valid31 = true;
passing2 = 0;
}
const _errs193 = errors;
if(errors === _errs193){
if(data57 && typeof data57 == "object" && !Array.isArray(data57)){
let missing23;
if(((data57.kind === undefined) && (missing23 = "kind")) || ((data57.id === undefined) && (missing23 = "id"))){
const err153 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/1/required",keyword:"required",params:{missingProperty: missing23},message:"must have required property '"+missing23+"'"};
if(vErrors === null){
vErrors = [err153];
}
else {
vErrors.push(err153);
}
errors++;
}
else {
const _errs195 = errors;
for(const key23 in data57){
if(!((key23 === "id") || (key23 === "kind"))){
const err154 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key23},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err154];
}
else {
vErrors.push(err154);
}
errors++;
break;
}
}
if(_errs195 === errors){
if(data57.id !== undefined){
const _errs196 = errors;
if(typeof data57.id !== "string"){
const err155 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/1/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err155];
}
else {
vErrors.push(err155);
}
errors++;
}
var valid33 = _errs196 === errors;
}
else {
var valid33 = true;
}
if(valid33){
if(data57.kind !== undefined){
let data60 = data57.kind;
const _errs198 = errors;
if(typeof data60 !== "string"){
const err156 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err156];
}
else {
vErrors.push(err156);
}
errors++;
}
if("voyage" !== data60){
const err157 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err157];
}
else {
vErrors.push(err157);
}
errors++;
}
var valid33 = _errs198 === errors;
}
else {
var valid33 = true;
}
}
}
}
}
else {
const err158 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err158];
}
else {
vErrors.push(err158);
}
errors++;
}
}
var _valid2 = _errs193 === errors;
if(_valid2 && valid31){
valid31 = false;
passing2 = [passing2, 1];
}
else {
if(_valid2){
valid31 = true;
passing2 = 1;
}
const _errs200 = errors;
if(errors === _errs200){
if(data57 && typeof data57 == "object" && !Array.isArray(data57)){
let missing24;
if(((data57.kind === undefined) && (missing24 = "kind")) || ((data57.id === undefined) && (missing24 = "id"))){
const err159 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/2/required",keyword:"required",params:{missingProperty: missing24},message:"must have required property '"+missing24+"'"};
if(vErrors === null){
vErrors = [err159];
}
else {
vErrors.push(err159);
}
errors++;
}
else {
const _errs202 = errors;
for(const key24 in data57){
if(!((key24 === "id") || (key24 === "kind"))){
const err160 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key24},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err160];
}
else {
vErrors.push(err160);
}
errors++;
break;
}
}
if(_errs202 === errors){
if(data57.id !== undefined){
const _errs203 = errors;
if(typeof data57.id !== "string"){
const err161 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/2/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err161];
}
else {
vErrors.push(err161);
}
errors++;
}
var valid34 = _errs203 === errors;
}
else {
var valid34 = true;
}
if(valid34){
if(data57.kind !== undefined){
let data62 = data57.kind;
const _errs205 = errors;
if(typeof data62 !== "string"){
const err162 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err162];
}
else {
vErrors.push(err162);
}
errors++;
}
if("fleet" !== data62){
const err163 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err163];
}
else {
vErrors.push(err163);
}
errors++;
}
var valid34 = _errs205 === errors;
}
else {
var valid34 = true;
}
}
}
}
}
else {
const err164 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err164];
}
else {
vErrors.push(err164);
}
errors++;
}
}
var _valid2 = _errs200 === errors;
if(_valid2 && valid31){
valid31 = false;
passing2 = [passing2, 2];
}
else {
if(_valid2){
valid31 = true;
passing2 = 2;
}
const _errs207 = errors;
if(errors === _errs207){
if(data57 && typeof data57 == "object" && !Array.isArray(data57)){
let missing25;
if(((data57.kind === undefined) && (missing25 = "kind")) || ((data57.id === undefined) && (missing25 = "id"))){
const err165 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/3/required",keyword:"required",params:{missingProperty: missing25},message:"must have required property '"+missing25+"'"};
if(vErrors === null){
vErrors = [err165];
}
else {
vErrors.push(err165);
}
errors++;
}
else {
const _errs209 = errors;
for(const key25 in data57){
if(!((key25 === "id") || (key25 === "kind"))){
const err166 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key25},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err166];
}
else {
vErrors.push(err166);
}
errors++;
break;
}
}
if(_errs209 === errors){
if(data57.id !== undefined){
const _errs210 = errors;
if(typeof data57.id !== "string"){
const err167 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/3/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err167];
}
else {
vErrors.push(err167);
}
errors++;
}
var valid35 = _errs210 === errors;
}
else {
var valid35 = true;
}
if(valid35){
if(data57.kind !== undefined){
let data64 = data57.kind;
const _errs212 = errors;
if(typeof data64 !== "string"){
const err168 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/3/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err168];
}
else {
vErrors.push(err168);
}
errors++;
}
if("vessel" !== data64){
const err169 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/3/properties/kind/const",keyword:"const",params:{allowedValue: "vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err169];
}
else {
vErrors.push(err169);
}
errors++;
}
var valid35 = _errs212 === errors;
}
else {
var valid35 = true;
}
}
}
}
}
else {
const err170 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err170];
}
else {
vErrors.push(err170);
}
errors++;
}
}
var _valid2 = _errs207 === errors;
if(_valid2 && valid31){
valid31 = false;
passing2 = [passing2, 3];
}
else {
if(_valid2){
valid31 = true;
passing2 = 3;
}
const _errs214 = errors;
if(errors === _errs214){
if(data57 && typeof data57 == "object" && !Array.isArray(data57)){
let missing26;
if(((data57.kind === undefined) && (missing26 = "kind")) || ((data57.id === undefined) && (missing26 = "id"))){
const err171 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/4/required",keyword:"required",params:{missingProperty: missing26},message:"must have required property '"+missing26+"'"};
if(vErrors === null){
vErrors = [err171];
}
else {
vErrors.push(err171);
}
errors++;
}
else {
const _errs216 = errors;
for(const key26 in data57){
if(!((key26 === "id") || (key26 === "kind"))){
const err172 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key26},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err172];
}
else {
vErrors.push(err172);
}
errors++;
break;
}
}
if(_errs216 === errors){
if(data57.id !== undefined){
const _errs217 = errors;
if(typeof data57.id !== "string"){
const err173 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/4/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err173];
}
else {
vErrors.push(err173);
}
errors++;
}
var valid36 = _errs217 === errors;
}
else {
var valid36 = true;
}
if(valid36){
if(data57.kind !== undefined){
let data66 = data57.kind;
const _errs219 = errors;
if(typeof data66 !== "string"){
const err174 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/4/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err174];
}
else {
vErrors.push(err174);
}
errors++;
}
if("portal" !== data66){
const err175 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/4/properties/kind/const",keyword:"const",params:{allowedValue: "portal"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err175];
}
else {
vErrors.push(err175);
}
errors++;
}
var valid36 = _errs219 === errors;
}
else {
var valid36 = true;
}
}
}
}
}
else {
const err176 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err176];
}
else {
vErrors.push(err176);
}
errors++;
}
}
var _valid2 = _errs214 === errors;
if(_valid2 && valid31){
valid31 = false;
passing2 = [passing2, 4];
}
else {
if(_valid2){
valid31 = true;
passing2 = 4;
}
}
}
}
}
if(!valid31){
const err177 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf",keyword:"oneOf",params:{passingSchemas: passing2},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err177];
}
else {
vErrors.push(err177);
}
errors++;
}
else {
errors = _errs187;
if(vErrors !== null){
if(_errs187){
vErrors.length = _errs187;
}
else {
vErrors = null;
}
}
}
var valid29 = _errs185 === errors;
}
else {
var valid29 = true;
}
if(valid29){
if(data.operation !== undefined){
let data67 = data.operation;
const _errs221 = errors;
if(typeof data67 !== "string"){
const err178 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/17/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err178];
}
else {
vErrors.push(err178);
}
errors++;
}
if("dock" !== data67){
const err179 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/17/properties/operation/const",keyword:"const",params:{allowedValue: "dock"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err179];
}
else {
vErrors.push(err179);
}
errors++;
}
var valid29 = _errs221 === errors;
}
else {
var valid29 = true;
}
}
}
}
}
else {
const err180 = {instancePath,schemaPath:"#/oneOf/17/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err180];
}
else {
vErrors.push(err180);
}
errors++;
}
}
var _valid0 = _errs182 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 17];
}
else {
if(_valid0){
valid0 = true;
passing0 = 17;
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
if(!valid0){
const err181 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err181];
}
else {
vErrors.push(err181);
}
errors++;
validate39.errors = vErrors;
return false;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate39.errors = vErrors;
return errors === 0;
}


function validate38(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((((data.requestId === undefined) && (missing0 = "requestId")) || ((data.expectedVersion === undefined) && (missing0 = "expectedVersion"))) || ((data.action === undefined) && (missing0 = "action"))){
validate38.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(((key0 === "action") || (key0 === "expectedVersion")) || (key0 === "requestId"))){
validate38.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.action !== undefined){
const _errs2 = errors;
if(!(validate39(data.action, {instancePath:instancePath+"/action",parentData:data,parentDataProperty:"action",rootData}))){
vErrors = vErrors === null ? validate39.errors : vErrors.concat(validate39.errors);
errors = vErrors.length;
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.expectedVersion !== undefined){
const _errs3 = errors;
if(typeof data.expectedVersion !== "string"){
validate38.errors = [{instancePath:instancePath+"/expectedVersion",schemaPath:"#/properties/expectedVersion/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs3 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.requestId !== undefined){
const _errs5 = errors;
if(typeof data.requestId !== "string"){
validate38.errors = [{instancePath:instancePath+"/requestId",schemaPath:"#/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs5 === errors;
}
else {
var valid0 = true;
}
}
}
}
}
}
else {
validate38.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate38.errors = vErrors;
return errors === 0;
}

export const response = validate43;
const schema75 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"definitions":{"Axis":{"enum":["horizontal","vertical"],"type":"string"},"Content":{"additionalProperties":false,"properties":{"backend":{"type":["string","null"]},"cwd":{"type":"string"},"id":{"type":"string"},"startPending":{"type":["string","null"]},"typeId":{"type":"string"}},"required":["id","typeId","cwd"],"type":"object"},"Context":{"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"workspace","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]},"Fleet":{"additionalProperties":false,"properties":{"id":{"type":"string"},"name":{"type":"string"},"root":{"$ref":"#/definitions/Split"},"vessels":{"items":{"$ref":"#/definitions/Vessel"},"type":"array"}},"required":["id","name","vessels","root"],"type":"object"},"Layout":{"additionalProperties":false,"properties":{"contents":{"items":{"$ref":"#/definitions/Content"},"type":"array"},"context":{"$ref":"#/definitions/Context"},"nextId":{"type":"string"},"savedLayouts":{"default":[],"items":{"$ref":"#/definitions/SavedLayout"},"type":"array"},"selectedFleet":{"type":["string","null"]},"selectedVoyage":{"type":["string","null"]},"view":{"allOf":[{"$ref":"#/definitions/WorkspaceView"}],"default":"fleet"},"voyages":{"items":{"$ref":"#/definitions/Voyage"},"type":"array"}},"required":["voyages","contents","context","nextId"],"type":"object"},"SavedLayout":{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"name":{"type":"string"},"root":{"$ref":"#/definitions/Split"}},"required":["fleet","name","root"],"type":"object"},"Split":{"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"leaf","type":"string"},"placement":{"type":"string"}},"required":["kind","placement"],"type":"object"},{"additionalProperties":false,"properties":{"axis":{"$ref":"#/definitions/Axis"},"first":{"$ref":"#/definitions/Split"},"kind":{"const":"branch","type":"string"},"second":{"$ref":"#/definitions/Split"},"share":{"allOf":[{"$ref":"#/definitions/SplitShare"}],"default":5000}},"required":["kind","axis","first","second"],"type":"object"}]},"SplitShare":{"maximum":9999,"minimum":1,"type":"integer"},"Status":{"enum":["applied","rejected","uncertain"],"type":"string"},"Vessel":{"additionalProperties":false,"properties":{"content":{"type":"string"},"id":{"type":"string"},"name":{"type":["string","null"]}},"required":["id","content"],"type":"object"},"Voyage":{"additionalProperties":false,"properties":{"fleets":{"items":{"$ref":"#/definitions/Fleet"},"type":"array"},"id":{"type":"string"},"name":{"type":"string"},"portals":{"items":{"$ref":"#/definitions/Vessel"},"type":"array"}},"required":["id","name","fleets","portals"],"type":"object"},"WorkspaceView":{"enum":["home","fleet"],"type":"string"}},"properties":{"createdContents":{"items":{"type":"string"},"type":"array"},"createdWorkspace":{"type":"boolean"},"fresh":{"type":"boolean"},"layout":{"$ref":"#/definitions/Layout"},"message":{"type":["string","null"]},"requestId":{"type":"string"},"status":{"$ref":"#/definitions/Status"},"version":{"type":"string"}},"required":["requestId","status","version","layout","fresh","createdWorkspace","createdContents"],"title":"Response","type":"object"};
const schema88 = {"enum":["applied","rejected","uncertain"],"type":"string"};
const schema76 = {"additionalProperties":false,"properties":{"contents":{"items":{"$ref":"#/definitions/Content"},"type":"array"},"context":{"$ref":"#/definitions/Context"},"nextId":{"type":"string"},"savedLayouts":{"default":[],"items":{"$ref":"#/definitions/SavedLayout"},"type":"array"},"selectedFleet":{"type":["string","null"]},"selectedVoyage":{"type":["string","null"]},"view":{"allOf":[{"$ref":"#/definitions/WorkspaceView"}],"default":"fleet"},"voyages":{"items":{"$ref":"#/definitions/Voyage"},"type":"array"}},"required":["voyages","contents","context","nextId"],"type":"object"};
const schema77 = {"additionalProperties":false,"properties":{"backend":{"type":["string","null"]},"cwd":{"type":"string"},"id":{"type":"string"},"startPending":{"type":["string","null"]},"typeId":{"type":"string"}},"required":["id","typeId","cwd"],"type":"object"};
const schema78 = {"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"workspace","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]};
const schema83 = {"enum":["home","fleet"],"type":"string"};
const schema79 = {"additionalProperties":false,"properties":{"fleet":{"type":"string"},"name":{"type":"string"},"root":{"$ref":"#/definitions/Split"}},"required":["fleet","name","root"],"type":"object"};
const schema80 = {"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"leaf","type":"string"},"placement":{"type":"string"}},"required":["kind","placement"],"type":"object"},{"additionalProperties":false,"properties":{"axis":{"$ref":"#/definitions/Axis"},"first":{"$ref":"#/definitions/Split"},"kind":{"const":"branch","type":"string"},"second":{"$ref":"#/definitions/Split"},"share":{"allOf":[{"$ref":"#/definitions/SplitShare"}],"default":5000}},"required":["kind","axis","first","second"],"type":"object"}]};
const schema81 = {"enum":["horizontal","vertical"],"type":"string"};
const schema82 = {"maximum":9999,"minimum":1,"type":"integer"};
const wrapper0 = {validate: validate46};

function validate46(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(errors === _errs1){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((data.kind === undefined) && (missing0 = "kind")) || ((data.placement === undefined) && (missing0 = "placement"))){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
else {
const _errs3 = errors;
for(const key0 in data){
if(!((key0 === "kind") || (key0 === "placement"))){
const err1 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
break;
}
}
if(_errs3 === errors){
if(data.kind !== undefined){
let data0 = data.kind;
const _errs4 = errors;
if(typeof data0 !== "string"){
const err2 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if("leaf" !== data0){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "leaf"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
var valid1 = _errs4 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.placement !== undefined){
const _errs6 = errors;
if(typeof data.placement !== "string"){
const err4 = {instancePath:instancePath+"/placement",schemaPath:"#/oneOf/0/properties/placement/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
var valid1 = _errs6 === errors;
}
else {
var valid1 = true;
}
}
}
}
}
else {
const err5 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
}
const _errs8 = errors;
if(errors === _errs8){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing1;
if(((((data.kind === undefined) && (missing1 = "kind")) || ((data.axis === undefined) && (missing1 = "axis"))) || ((data.first === undefined) && (missing1 = "first"))) || ((data.second === undefined) && (missing1 = "second"))){
const err6 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
else {
const _errs10 = errors;
for(const key1 in data){
if(!(((((key1 === "axis") || (key1 === "first")) || (key1 === "kind")) || (key1 === "second")) || (key1 === "share"))){
const err7 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
break;
}
}
if(_errs10 === errors){
if(data.axis !== undefined){
let data2 = data.axis;
const _errs11 = errors;
if(typeof data2 !== "string"){
const err8 = {instancePath:instancePath+"/axis",schemaPath:"#/definitions/Axis/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(!((data2 === "horizontal") || (data2 === "vertical"))){
const err9 = {instancePath:instancePath+"/axis",schemaPath:"#/definitions/Axis/enum",keyword:"enum",params:{allowedValues: schema81.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
var valid2 = _errs11 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data.first !== undefined){
const _errs14 = errors;
if(!(wrapper0.validate(data.first, {instancePath:instancePath+"/first",parentData:data,parentDataProperty:"first",rootData}))){
vErrors = vErrors === null ? wrapper0.validate.errors : vErrors.concat(wrapper0.validate.errors);
errors = vErrors.length;
}
var valid2 = _errs14 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data.kind !== undefined){
let data4 = data.kind;
const _errs15 = errors;
if(typeof data4 !== "string"){
const err10 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if("branch" !== data4){
const err11 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "branch"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
var valid2 = _errs15 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data.second !== undefined){
const _errs17 = errors;
if(!(wrapper0.validate(data.second, {instancePath:instancePath+"/second",parentData:data,parentDataProperty:"second",rootData}))){
vErrors = vErrors === null ? wrapper0.validate.errors : vErrors.concat(wrapper0.validate.errors);
errors = vErrors.length;
}
var valid2 = _errs17 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data.share !== undefined){
let data6 = data.share;
const _errs18 = errors;
const _errs20 = errors;
if(!(((typeof data6 == "number") && (!(data6 % 1) && !isNaN(data6))) && (isFinite(data6)))){
const err12 = {instancePath:instancePath+"/share",schemaPath:"#/definitions/SplitShare/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(errors === _errs20){
if((typeof data6 == "number") && (isFinite(data6))){
if(data6 > 9999 || isNaN(data6)){
const err13 = {instancePath:instancePath+"/share",schemaPath:"#/definitions/SplitShare/maximum",keyword:"maximum",params:{comparison: "<=", limit: 9999},message:"must be <= 9999"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
else {
if(data6 < 1 || isNaN(data6)){
const err14 = {instancePath:instancePath+"/share",schemaPath:"#/definitions/SplitShare/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
}
}
var valid2 = _errs18 === errors;
}
else {
var valid2 = true;
}
}
}
}
}
}
}
}
else {
const err15 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
var _valid0 = _errs8 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
}
}
if(!valid0){
const err16 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
validate46.errors = vErrors;
return false;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate46.errors = vErrors;
return errors === 0;
}


function validate45(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((((data.fleet === undefined) && (missing0 = "fleet")) || ((data.name === undefined) && (missing0 = "name"))) || ((data.root === undefined) && (missing0 = "root"))){
validate45.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(((key0 === "fleet") || (key0 === "name")) || (key0 === "root"))){
validate45.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.fleet !== undefined){
const _errs2 = errors;
if(typeof data.fleet !== "string"){
validate45.errors = [{instancePath:instancePath+"/fleet",schemaPath:"#/properties/fleet/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.name !== undefined){
const _errs4 = errors;
if(typeof data.name !== "string"){
validate45.errors = [{instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs4 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.root !== undefined){
const _errs6 = errors;
if(!(validate46(data.root, {instancePath:instancePath+"/root",parentData:data,parentDataProperty:"root",rootData}))){
vErrors = vErrors === null ? validate46.errors : vErrors.concat(validate46.errors);
errors = vErrors.length;
}
var valid0 = _errs6 === errors;
}
else {
var valid0 = true;
}
}
}
}
}
}
else {
validate45.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate45.errors = vErrors;
return errors === 0;
}

const schema84 = {"additionalProperties":false,"properties":{"fleets":{"items":{"$ref":"#/definitions/Fleet"},"type":"array"},"id":{"type":"string"},"name":{"type":"string"},"portals":{"items":{"$ref":"#/definitions/Vessel"},"type":"array"}},"required":["id","name","fleets","portals"],"type":"object"};
const schema86 = {"additionalProperties":false,"properties":{"content":{"type":"string"},"id":{"type":"string"},"name":{"type":["string","null"]}},"required":["id","content"],"type":"object"};
const schema85 = {"additionalProperties":false,"properties":{"id":{"type":"string"},"name":{"type":"string"},"root":{"$ref":"#/definitions/Split"},"vessels":{"items":{"$ref":"#/definitions/Vessel"},"type":"array"}},"required":["id","name","vessels","root"],"type":"object"};

function validate50(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((((data.id === undefined) && (missing0 = "id")) || ((data.name === undefined) && (missing0 = "name"))) || ((data.vessels === undefined) && (missing0 = "vessels"))) || ((data.root === undefined) && (missing0 = "root"))){
validate50.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((((key0 === "id") || (key0 === "name")) || (key0 === "root")) || (key0 === "vessels"))){
validate50.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.id !== undefined){
const _errs2 = errors;
if(typeof data.id !== "string"){
validate50.errors = [{instancePath:instancePath+"/id",schemaPath:"#/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.name !== undefined){
const _errs4 = errors;
if(typeof data.name !== "string"){
validate50.errors = [{instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs4 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.root !== undefined){
const _errs6 = errors;
if(!(validate46(data.root, {instancePath:instancePath+"/root",parentData:data,parentDataProperty:"root",rootData}))){
vErrors = vErrors === null ? validate46.errors : vErrors.concat(validate46.errors);
errors = vErrors.length;
}
var valid0 = _errs6 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.vessels !== undefined){
let data3 = data.vessels;
const _errs7 = errors;
if(errors === _errs7){
if(Array.isArray(data3)){
var valid1 = true;
const len0 = data3.length;
for(let i0=0; i0<len0; i0++){
let data4 = data3[i0];
const _errs9 = errors;
const _errs10 = errors;
if(errors === _errs10){
if(data4 && typeof data4 == "object" && !Array.isArray(data4)){
let missing1;
if(((data4.id === undefined) && (missing1 = "id")) || ((data4.content === undefined) && (missing1 = "content"))){
validate50.errors = [{instancePath:instancePath+"/vessels/" + i0,schemaPath:"#/definitions/Vessel/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"}];
return false;
}
else {
const _errs12 = errors;
for(const key1 in data4){
if(!(((key1 === "content") || (key1 === "id")) || (key1 === "name"))){
validate50.errors = [{instancePath:instancePath+"/vessels/" + i0,schemaPath:"#/definitions/Vessel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs12 === errors){
if(data4.content !== undefined){
const _errs13 = errors;
if(typeof data4.content !== "string"){
validate50.errors = [{instancePath:instancePath+"/vessels/" + i0+"/content",schemaPath:"#/definitions/Vessel/properties/content/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid3 = _errs13 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data4.id !== undefined){
const _errs15 = errors;
if(typeof data4.id !== "string"){
validate50.errors = [{instancePath:instancePath+"/vessels/" + i0+"/id",schemaPath:"#/definitions/Vessel/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid3 = _errs15 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data4.name !== undefined){
let data7 = data4.name;
const _errs17 = errors;
if((typeof data7 !== "string") && (data7 !== null)){
validate50.errors = [{instancePath:instancePath+"/vessels/" + i0+"/name",schemaPath:"#/definitions/Vessel/properties/name/type",keyword:"type",params:{type: schema86.properties.name.type},message:"must be string,null"}];
return false;
}
var valid3 = _errs17 === errors;
}
else {
var valid3 = true;
}
}
}
}
}
}
else {
validate50.errors = [{instancePath:instancePath+"/vessels/" + i0,schemaPath:"#/definitions/Vessel/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
var valid1 = _errs9 === errors;
if(!valid1){
break;
}
}
}
else {
validate50.errors = [{instancePath:instancePath+"/vessels",schemaPath:"#/properties/vessels/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
var valid0 = _errs7 === errors;
}
else {
var valid0 = true;
}
}
}
}
}
}
}
else {
validate50.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate50.errors = vErrors;
return errors === 0;
}


function validate49(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((((data.id === undefined) && (missing0 = "id")) || ((data.name === undefined) && (missing0 = "name"))) || ((data.fleets === undefined) && (missing0 = "fleets"))) || ((data.portals === undefined) && (missing0 = "portals"))){
validate49.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((((key0 === "fleets") || (key0 === "id")) || (key0 === "name")) || (key0 === "portals"))){
validate49.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.fleets !== undefined){
let data0 = data.fleets;
const _errs2 = errors;
if(errors === _errs2){
if(Array.isArray(data0)){
var valid1 = true;
const len0 = data0.length;
for(let i0=0; i0<len0; i0++){
const _errs4 = errors;
if(!(validate50(data0[i0], {instancePath:instancePath+"/fleets/" + i0,parentData:data0,parentDataProperty:i0,rootData}))){
vErrors = vErrors === null ? validate50.errors : vErrors.concat(validate50.errors);
errors = vErrors.length;
}
var valid1 = _errs4 === errors;
if(!valid1){
break;
}
}
}
else {
validate49.errors = [{instancePath:instancePath+"/fleets",schemaPath:"#/properties/fleets/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.id !== undefined){
const _errs5 = errors;
if(typeof data.id !== "string"){
validate49.errors = [{instancePath:instancePath+"/id",schemaPath:"#/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs5 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.name !== undefined){
const _errs7 = errors;
if(typeof data.name !== "string"){
validate49.errors = [{instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs7 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.portals !== undefined){
let data4 = data.portals;
const _errs9 = errors;
if(errors === _errs9){
if(Array.isArray(data4)){
var valid2 = true;
const len1 = data4.length;
for(let i1=0; i1<len1; i1++){
let data5 = data4[i1];
const _errs11 = errors;
const _errs12 = errors;
if(errors === _errs12){
if(data5 && typeof data5 == "object" && !Array.isArray(data5)){
let missing1;
if(((data5.id === undefined) && (missing1 = "id")) || ((data5.content === undefined) && (missing1 = "content"))){
validate49.errors = [{instancePath:instancePath+"/portals/" + i1,schemaPath:"#/definitions/Vessel/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"}];
return false;
}
else {
const _errs14 = errors;
for(const key1 in data5){
if(!(((key1 === "content") || (key1 === "id")) || (key1 === "name"))){
validate49.errors = [{instancePath:instancePath+"/portals/" + i1,schemaPath:"#/definitions/Vessel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs14 === errors){
if(data5.content !== undefined){
const _errs15 = errors;
if(typeof data5.content !== "string"){
validate49.errors = [{instancePath:instancePath+"/portals/" + i1+"/content",schemaPath:"#/definitions/Vessel/properties/content/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid4 = _errs15 === errors;
}
else {
var valid4 = true;
}
if(valid4){
if(data5.id !== undefined){
const _errs17 = errors;
if(typeof data5.id !== "string"){
validate49.errors = [{instancePath:instancePath+"/portals/" + i1+"/id",schemaPath:"#/definitions/Vessel/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid4 = _errs17 === errors;
}
else {
var valid4 = true;
}
if(valid4){
if(data5.name !== undefined){
let data8 = data5.name;
const _errs19 = errors;
if((typeof data8 !== "string") && (data8 !== null)){
validate49.errors = [{instancePath:instancePath+"/portals/" + i1+"/name",schemaPath:"#/definitions/Vessel/properties/name/type",keyword:"type",params:{type: schema86.properties.name.type},message:"must be string,null"}];
return false;
}
var valid4 = _errs19 === errors;
}
else {
var valid4 = true;
}
}
}
}
}
}
else {
validate49.errors = [{instancePath:instancePath+"/portals/" + i1,schemaPath:"#/definitions/Vessel/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
var valid2 = _errs11 === errors;
if(!valid2){
break;
}
}
}
else {
validate49.errors = [{instancePath:instancePath+"/portals",schemaPath:"#/properties/portals/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
var valid0 = _errs9 === errors;
}
else {
var valid0 = true;
}
}
}
}
}
}
}
else {
validate49.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate49.errors = vErrors;
return errors === 0;
}


function validate44(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((((data.voyages === undefined) && (missing0 = "voyages")) || ((data.contents === undefined) && (missing0 = "contents"))) || ((data.context === undefined) && (missing0 = "context"))) || ((data.nextId === undefined) && (missing0 = "nextId"))){
validate44.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((((((((key0 === "contents") || (key0 === "context")) || (key0 === "nextId")) || (key0 === "savedLayouts")) || (key0 === "selectedFleet")) || (key0 === "selectedVoyage")) || (key0 === "view")) || (key0 === "voyages"))){
validate44.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.contents !== undefined){
let data0 = data.contents;
const _errs2 = errors;
if(errors === _errs2){
if(Array.isArray(data0)){
var valid1 = true;
const len0 = data0.length;
for(let i0=0; i0<len0; i0++){
let data1 = data0[i0];
const _errs4 = errors;
const _errs5 = errors;
if(errors === _errs5){
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
let missing1;
if((((data1.id === undefined) && (missing1 = "id")) || ((data1.typeId === undefined) && (missing1 = "typeId"))) || ((data1.cwd === undefined) && (missing1 = "cwd"))){
validate44.errors = [{instancePath:instancePath+"/contents/" + i0,schemaPath:"#/definitions/Content/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"}];
return false;
}
else {
const _errs7 = errors;
for(const key1 in data1){
if(!(((((key1 === "backend") || (key1 === "cwd")) || (key1 === "id")) || (key1 === "startPending")) || (key1 === "typeId"))){
validate44.errors = [{instancePath:instancePath+"/contents/" + i0,schemaPath:"#/definitions/Content/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs7 === errors){
if(data1.backend !== undefined){
let data2 = data1.backend;
const _errs8 = errors;
if((typeof data2 !== "string") && (data2 !== null)){
validate44.errors = [{instancePath:instancePath+"/contents/" + i0+"/backend",schemaPath:"#/definitions/Content/properties/backend/type",keyword:"type",params:{type: schema77.properties.backend.type},message:"must be string,null"}];
return false;
}
var valid3 = _errs8 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data1.cwd !== undefined){
const _errs10 = errors;
if(typeof data1.cwd !== "string"){
validate44.errors = [{instancePath:instancePath+"/contents/" + i0+"/cwd",schemaPath:"#/definitions/Content/properties/cwd/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid3 = _errs10 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data1.id !== undefined){
const _errs12 = errors;
if(typeof data1.id !== "string"){
validate44.errors = [{instancePath:instancePath+"/contents/" + i0+"/id",schemaPath:"#/definitions/Content/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid3 = _errs12 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data1.startPending !== undefined){
let data5 = data1.startPending;
const _errs14 = errors;
if((typeof data5 !== "string") && (data5 !== null)){
validate44.errors = [{instancePath:instancePath+"/contents/" + i0+"/startPending",schemaPath:"#/definitions/Content/properties/startPending/type",keyword:"type",params:{type: schema77.properties.startPending.type},message:"must be string,null"}];
return false;
}
var valid3 = _errs14 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data1.typeId !== undefined){
const _errs16 = errors;
if(typeof data1.typeId !== "string"){
validate44.errors = [{instancePath:instancePath+"/contents/" + i0+"/typeId",schemaPath:"#/definitions/Content/properties/typeId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid3 = _errs16 === errors;
}
else {
var valid3 = true;
}
}
}
}
}
}
}
}
else {
validate44.errors = [{instancePath:instancePath+"/contents/" + i0,schemaPath:"#/definitions/Content/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
var valid1 = _errs4 === errors;
if(!valid1){
break;
}
}
}
else {
validate44.errors = [{instancePath:instancePath+"/contents",schemaPath:"#/properties/contents/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.context !== undefined){
let data7 = data.context;
const _errs18 = errors;
const _errs20 = errors;
let valid5 = false;
let passing0 = null;
const _errs21 = errors;
if(errors === _errs21){
if(data7 && typeof data7 == "object" && !Array.isArray(data7)){
let missing2;
if((data7.kind === undefined) && (missing2 = "kind")){
const err0 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/0/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
else {
const _errs23 = errors;
for(const key2 in data7){
if(!(key2 === "kind")){
const err1 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
break;
}
}
if(_errs23 === errors){
if(data7.kind !== undefined){
let data8 = data7.kind;
if(typeof data8 !== "string"){
const err2 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if("workspace" !== data8){
const err3 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "workspace"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
}
}
}
else {
const err4 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
var _valid0 = _errs21 === errors;
if(_valid0){
valid5 = true;
passing0 = 0;
}
const _errs26 = errors;
if(errors === _errs26){
if(data7 && typeof data7 == "object" && !Array.isArray(data7)){
let missing3;
if(((data7.kind === undefined) && (missing3 = "kind")) || ((data7.id === undefined) && (missing3 = "id"))){
const err5 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/1/required",keyword:"required",params:{missingProperty: missing3},message:"must have required property '"+missing3+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
else {
const _errs28 = errors;
for(const key3 in data7){
if(!((key3 === "id") || (key3 === "kind"))){
const err6 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
break;
}
}
if(_errs28 === errors){
if(data7.id !== undefined){
const _errs29 = errors;
if(typeof data7.id !== "string"){
const err7 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/1/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
var valid7 = _errs29 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data7.kind !== undefined){
let data10 = data7.kind;
const _errs31 = errors;
if(typeof data10 !== "string"){
const err8 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if("voyage" !== data10){
const err9 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
var valid7 = _errs31 === errors;
}
else {
var valid7 = true;
}
}
}
}
}
else {
const err10 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
var _valid0 = _errs26 === errors;
if(_valid0 && valid5){
valid5 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid5 = true;
passing0 = 1;
}
const _errs33 = errors;
if(errors === _errs33){
if(data7 && typeof data7 == "object" && !Array.isArray(data7)){
let missing4;
if(((data7.kind === undefined) && (missing4 = "kind")) || ((data7.id === undefined) && (missing4 = "id"))){
const err11 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/2/required",keyword:"required",params:{missingProperty: missing4},message:"must have required property '"+missing4+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
else {
const _errs35 = errors;
for(const key4 in data7){
if(!((key4 === "id") || (key4 === "kind"))){
const err12 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
break;
}
}
if(_errs35 === errors){
if(data7.id !== undefined){
const _errs36 = errors;
if(typeof data7.id !== "string"){
const err13 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/2/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
var valid8 = _errs36 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data7.kind !== undefined){
let data12 = data7.kind;
const _errs38 = errors;
if(typeof data12 !== "string"){
const err14 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if("fleet" !== data12){
const err15 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
var valid8 = _errs38 === errors;
}
else {
var valid8 = true;
}
}
}
}
}
else {
const err16 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
var _valid0 = _errs33 === errors;
if(_valid0 && valid5){
valid5 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid5 = true;
passing0 = 2;
}
const _errs40 = errors;
if(errors === _errs40){
if(data7 && typeof data7 == "object" && !Array.isArray(data7)){
let missing5;
if(((data7.kind === undefined) && (missing5 = "kind")) || ((data7.id === undefined) && (missing5 = "id"))){
const err17 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/3/required",keyword:"required",params:{missingProperty: missing5},message:"must have required property '"+missing5+"'"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
else {
const _errs42 = errors;
for(const key5 in data7){
if(!((key5 === "id") || (key5 === "kind"))){
const err18 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
break;
}
}
if(_errs42 === errors){
if(data7.id !== undefined){
const _errs43 = errors;
if(typeof data7.id !== "string"){
const err19 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/3/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
var valid9 = _errs43 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data7.kind !== undefined){
let data14 = data7.kind;
const _errs45 = errors;
if(typeof data14 !== "string"){
const err20 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/3/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if("vessel" !== data14){
const err21 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/3/properties/kind/const",keyword:"const",params:{allowedValue: "vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
var valid9 = _errs45 === errors;
}
else {
var valid9 = true;
}
}
}
}
}
else {
const err22 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
var _valid0 = _errs40 === errors;
if(_valid0 && valid5){
valid5 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid5 = true;
passing0 = 3;
}
const _errs47 = errors;
if(errors === _errs47){
if(data7 && typeof data7 == "object" && !Array.isArray(data7)){
let missing6;
if(((data7.kind === undefined) && (missing6 = "kind")) || ((data7.id === undefined) && (missing6 = "id"))){
const err23 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/4/required",keyword:"required",params:{missingProperty: missing6},message:"must have required property '"+missing6+"'"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
else {
const _errs49 = errors;
for(const key6 in data7){
if(!((key6 === "id") || (key6 === "kind"))){
const err24 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
break;
}
}
if(_errs49 === errors){
if(data7.id !== undefined){
const _errs50 = errors;
if(typeof data7.id !== "string"){
const err25 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/4/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
var valid10 = _errs50 === errors;
}
else {
var valid10 = true;
}
if(valid10){
if(data7.kind !== undefined){
let data16 = data7.kind;
const _errs52 = errors;
if(typeof data16 !== "string"){
const err26 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/4/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if("portal" !== data16){
const err27 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/4/properties/kind/const",keyword:"const",params:{allowedValue: "portal"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
var valid10 = _errs52 === errors;
}
else {
var valid10 = true;
}
}
}
}
}
else {
const err28 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
var _valid0 = _errs47 === errors;
if(_valid0 && valid5){
valid5 = false;
passing0 = [passing0, 4];
}
else {
if(_valid0){
valid5 = true;
passing0 = 4;
}
}
}
}
}
if(!valid5){
const err29 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
validate44.errors = vErrors;
return false;
}
else {
errors = _errs20;
if(vErrors !== null){
if(_errs20){
vErrors.length = _errs20;
}
else {
vErrors = null;
}
}
}
var valid0 = _errs18 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.nextId !== undefined){
const _errs54 = errors;
if(typeof data.nextId !== "string"){
validate44.errors = [{instancePath:instancePath+"/nextId",schemaPath:"#/properties/nextId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs54 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.savedLayouts !== undefined){
let data18 = data.savedLayouts;
const _errs56 = errors;
if(errors === _errs56){
if(Array.isArray(data18)){
var valid11 = true;
const len1 = data18.length;
for(let i1=0; i1<len1; i1++){
const _errs58 = errors;
if(!(validate45(data18[i1], {instancePath:instancePath+"/savedLayouts/" + i1,parentData:data18,parentDataProperty:i1,rootData}))){
vErrors = vErrors === null ? validate45.errors : vErrors.concat(validate45.errors);
errors = vErrors.length;
}
var valid11 = _errs58 === errors;
if(!valid11){
break;
}
}
}
else {
validate44.errors = [{instancePath:instancePath+"/savedLayouts",schemaPath:"#/properties/savedLayouts/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
var valid0 = _errs56 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.selectedFleet !== undefined){
let data20 = data.selectedFleet;
const _errs59 = errors;
if((typeof data20 !== "string") && (data20 !== null)){
validate44.errors = [{instancePath:instancePath+"/selectedFleet",schemaPath:"#/properties/selectedFleet/type",keyword:"type",params:{type: schema76.properties.selectedFleet.type},message:"must be string,null"}];
return false;
}
var valid0 = _errs59 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.selectedVoyage !== undefined){
let data21 = data.selectedVoyage;
const _errs61 = errors;
if((typeof data21 !== "string") && (data21 !== null)){
validate44.errors = [{instancePath:instancePath+"/selectedVoyage",schemaPath:"#/properties/selectedVoyage/type",keyword:"type",params:{type: schema76.properties.selectedVoyage.type},message:"must be string,null"}];
return false;
}
var valid0 = _errs61 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.view !== undefined){
let data22 = data.view;
const _errs63 = errors;
if(typeof data22 !== "string"){
validate44.errors = [{instancePath:instancePath+"/view",schemaPath:"#/definitions/WorkspaceView/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!((data22 === "home") || (data22 === "fleet"))){
validate44.errors = [{instancePath:instancePath+"/view",schemaPath:"#/definitions/WorkspaceView/enum",keyword:"enum",params:{allowedValues: schema83.enum},message:"must be equal to one of the allowed values"}];
return false;
}
var valid0 = _errs63 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.voyages !== undefined){
let data23 = data.voyages;
const _errs67 = errors;
if(errors === _errs67){
if(Array.isArray(data23)){
var valid14 = true;
const len2 = data23.length;
for(let i2=0; i2<len2; i2++){
const _errs69 = errors;
if(!(validate49(data23[i2], {instancePath:instancePath+"/voyages/" + i2,parentData:data23,parentDataProperty:i2,rootData}))){
vErrors = vErrors === null ? validate49.errors : vErrors.concat(validate49.errors);
errors = vErrors.length;
}
var valid14 = _errs69 === errors;
if(!valid14){
break;
}
}
}
else {
validate44.errors = [{instancePath:instancePath+"/voyages",schemaPath:"#/properties/voyages/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
var valid0 = _errs67 === errors;
}
else {
var valid0 = true;
}
}
}
}
}
}
}
}
}
}
}
else {
validate44.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate44.errors = vErrors;
return errors === 0;
}


function validate43(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((((((((data.requestId === undefined) && (missing0 = "requestId")) || ((data.status === undefined) && (missing0 = "status"))) || ((data.version === undefined) && (missing0 = "version"))) || ((data.layout === undefined) && (missing0 = "layout"))) || ((data.fresh === undefined) && (missing0 = "fresh"))) || ((data.createdWorkspace === undefined) && (missing0 = "createdWorkspace"))) || ((data.createdContents === undefined) && (missing0 = "createdContents"))){
validate43.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((((((((key0 === "createdContents") || (key0 === "createdWorkspace")) || (key0 === "fresh")) || (key0 === "layout")) || (key0 === "message")) || (key0 === "requestId")) || (key0 === "status")) || (key0 === "version"))){
validate43.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.createdContents !== undefined){
let data0 = data.createdContents;
const _errs2 = errors;
if(errors === _errs2){
if(Array.isArray(data0)){
var valid1 = true;
const len0 = data0.length;
for(let i0=0; i0<len0; i0++){
const _errs4 = errors;
if(typeof data0[i0] !== "string"){
validate43.errors = [{instancePath:instancePath+"/createdContents/" + i0,schemaPath:"#/properties/createdContents/items/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid1 = _errs4 === errors;
if(!valid1){
break;
}
}
}
else {
validate43.errors = [{instancePath:instancePath+"/createdContents",schemaPath:"#/properties/createdContents/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.createdWorkspace !== undefined){
const _errs6 = errors;
if(typeof data.createdWorkspace !== "boolean"){
validate43.errors = [{instancePath:instancePath+"/createdWorkspace",schemaPath:"#/properties/createdWorkspace/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"}];
return false;
}
var valid0 = _errs6 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.fresh !== undefined){
const _errs8 = errors;
if(typeof data.fresh !== "boolean"){
validate43.errors = [{instancePath:instancePath+"/fresh",schemaPath:"#/properties/fresh/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"}];
return false;
}
var valid0 = _errs8 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.layout !== undefined){
const _errs10 = errors;
if(!(validate44(data.layout, {instancePath:instancePath+"/layout",parentData:data,parentDataProperty:"layout",rootData}))){
vErrors = vErrors === null ? validate44.errors : vErrors.concat(validate44.errors);
errors = vErrors.length;
}
var valid0 = _errs10 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.message !== undefined){
let data5 = data.message;
const _errs11 = errors;
if((typeof data5 !== "string") && (data5 !== null)){
validate43.errors = [{instancePath:instancePath+"/message",schemaPath:"#/properties/message/type",keyword:"type",params:{type: schema75.properties.message.type},message:"must be string,null"}];
return false;
}
var valid0 = _errs11 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.requestId !== undefined){
const _errs13 = errors;
if(typeof data.requestId !== "string"){
validate43.errors = [{instancePath:instancePath+"/requestId",schemaPath:"#/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs13 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.status !== undefined){
let data7 = data.status;
const _errs15 = errors;
if(typeof data7 !== "string"){
validate43.errors = [{instancePath:instancePath+"/status",schemaPath:"#/definitions/Status/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!(((data7 === "applied") || (data7 === "rejected")) || (data7 === "uncertain"))){
validate43.errors = [{instancePath:instancePath+"/status",schemaPath:"#/definitions/Status/enum",keyword:"enum",params:{allowedValues: schema88.enum},message:"must be equal to one of the allowed values"}];
return false;
}
var valid0 = _errs15 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.version !== undefined){
const _errs18 = errors;
if(typeof data.version !== "string"){
validate43.errors = [{instancePath:instancePath+"/version",schemaPath:"#/properties/version/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs18 === errors;
}
else {
var valid0 = true;
}
}
}
}
}
}
}
}
}
}
}
else {
validate43.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate43.errors = vErrors;
return errors === 0;
}

export const terminalRequest = validate55;
const schema89 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"properties":{"contentId":{"type":"string"},"expectedVersion":{"type":"string"},"requestId":{"type":"string"}},"required":["requestId","contentId","expectedVersion"],"title":"TerminalRequest","type":"object"};

function validate55(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((((data.requestId === undefined) && (missing0 = "requestId")) || ((data.contentId === undefined) && (missing0 = "contentId"))) || ((data.expectedVersion === undefined) && (missing0 = "expectedVersion"))){
validate55.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(((key0 === "contentId") || (key0 === "expectedVersion")) || (key0 === "requestId"))){
validate55.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.contentId !== undefined){
const _errs2 = errors;
if(typeof data.contentId !== "string"){
validate55.errors = [{instancePath:instancePath+"/contentId",schemaPath:"#/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.expectedVersion !== undefined){
const _errs4 = errors;
if(typeof data.expectedVersion !== "string"){
validate55.errors = [{instancePath:instancePath+"/expectedVersion",schemaPath:"#/properties/expectedVersion/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs4 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.requestId !== undefined){
const _errs6 = errors;
if(typeof data.requestId !== "string"){
validate55.errors = [{instancePath:instancePath+"/requestId",schemaPath:"#/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs6 === errors;
}
else {
var valid0 = true;
}
}
}
}
}
}
else {
validate55.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate55.errors = vErrors;
return errors === 0;
}

export const terminalResponse = validate56;
const schema90 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"definitions":{"Status":{"enum":["applied","rejected","uncertain"],"type":"string"}},"properties":{"contentId":{"type":"string"},"message":{"type":["string","null"]},"requestId":{"type":"string"},"status":{"$ref":"#/definitions/Status"}},"required":["requestId","contentId","status"],"title":"TerminalResponse","type":"object"};
const schema91 = {"enum":["applied","rejected","uncertain"],"type":"string"};

function validate56(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((((data.requestId === undefined) && (missing0 = "requestId")) || ((data.contentId === undefined) && (missing0 = "contentId"))) || ((data.status === undefined) && (missing0 = "status"))){
validate56.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((((key0 === "contentId") || (key0 === "message")) || (key0 === "requestId")) || (key0 === "status"))){
validate56.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.contentId !== undefined){
const _errs2 = errors;
if(typeof data.contentId !== "string"){
validate56.errors = [{instancePath:instancePath+"/contentId",schemaPath:"#/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.message !== undefined){
let data1 = data.message;
const _errs4 = errors;
if((typeof data1 !== "string") && (data1 !== null)){
validate56.errors = [{instancePath:instancePath+"/message",schemaPath:"#/properties/message/type",keyword:"type",params:{type: schema90.properties.message.type},message:"must be string,null"}];
return false;
}
var valid0 = _errs4 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.requestId !== undefined){
const _errs6 = errors;
if(typeof data.requestId !== "string"){
validate56.errors = [{instancePath:instancePath+"/requestId",schemaPath:"#/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs6 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.status !== undefined){
let data3 = data.status;
const _errs8 = errors;
if(typeof data3 !== "string"){
validate56.errors = [{instancePath:instancePath+"/status",schemaPath:"#/definitions/Status/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!(((data3 === "applied") || (data3 === "rejected")) || (data3 === "uncertain"))){
validate56.errors = [{instancePath:instancePath+"/status",schemaPath:"#/definitions/Status/enum",keyword:"enum",params:{allowedValues: schema91.enum},message:"must be equal to one of the allowed values"}];
return false;
}
var valid0 = _errs8 === errors;
}
else {
var valid0 = true;
}
}
}
}
}
}
}
else {
validate56.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate56.errors = vErrors;
return errors === 0;
}

export const workspaceTool = validate57;
const schema92 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"definitions":{"Action":{"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"inspect","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"home","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"name":{"type":"string"},"operation":{"const":"save-layout","type":"string"}},"required":["operation","fleet","name"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"name":{"type":"string"},"operation":{"const":"load-layout","type":"string"}},"required":["operation","fleet","name"],"type":"object"},{"additionalProperties":false,"properties":{"cwd":{"type":"string"},"name":{"type":"string"},"operation":{"const":"create-voyage","type":"string"}},"required":["operation","name","cwd"],"type":"object"},{"additionalProperties":false,"properties":{"name":{"type":"string"},"operation":{"const":"create-fleet","type":"string"},"voyage":{"type":"string"}},"required":["operation","voyage","name"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"create-portal","type":"string"},"voyage":{"type":"string"}},"required":["operation","voyage"],"type":"object"},{"additionalProperties":false,"properties":{"destination":{"$ref":"#/definitions/ContentDestination"},"operation":{"const":"create-content","type":"string"},"typeId":{"type":"string"}},"required":["operation","typeId","destination"],"type":"object"},{"additionalProperties":false,"properties":{"name":{"type":"string"},"operation":{"const":"rename","type":"string"},"target":{"$ref":"#/definitions/RenameTarget"}},"required":["operation","target","name"],"type":"object"},{"additionalProperties":false,"properties":{"after":{"type":"string"},"axis":{"$ref":"#/definitions/Axis"},"fleet":{"type":"string"},"operation":{"const":"split","type":"string"}},"required":["operation","fleet","after","axis"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"operation":{"const":"resize-split","type":"string"},"path":{"items":{"$ref":"#/definitions/SplitChild"},"maxItems":128,"type":"array"},"share":{"$ref":"#/definitions/SplitShare"}},"required":["operation","fleet","path","share"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"move-vessel","type":"string"},"side":{"$ref":"#/definitions/Side"},"target":{"type":"string"}},"required":["operation","id","target","side"],"type":"object"},{"additionalProperties":false,"properties":{"before":{"type":"boolean"},"id":{"type":"string"},"operation":{"const":"move-voyage","type":"string"},"target":{"type":"string"}},"required":["operation","id","target","before"],"type":"object"},{"additionalProperties":false,"properties":{"before":{"type":"boolean"},"id":{"type":"string"},"operation":{"const":"move-fleet","type":"string"},"target":{"type":"string"}},"required":["operation","id","target","before"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"select-voyage","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"select-fleet","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"reveal-vessel","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"context":{"$ref":"#/definitions/Context"},"operation":{"const":"dock","type":"string"}},"required":["operation","context"],"type":"object"}]},"Axis":{"enum":["horizontal","vertical"],"type":"string"},"ContentDestination":{"oneOf":[{"additionalProperties":false,"properties":{"after":{"type":"string"},"axis":{"$ref":"#/definitions/Axis"},"fleet":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","fleet","after","axis"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"portal","type":"string"},"voyage":{"type":"string"}},"required":["kind","voyage"],"type":"object"}]},"Context":{"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"workspace","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]},"RenameTarget":{"oneOf":[{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]},"Side":{"enum":["left","right","top","bottom"],"type":"string"},"SplitChild":{"enum":["first","second"],"type":"string"},"SplitShare":{"maximum":9999,"minimum":1,"type":"integer"}},"properties":{"action":{"$ref":"#/definitions/Action"},"expectedVersion":{"type":"string"}},"required":["expectedVersion","action"],"title":"WorkspaceInput","type":"object"};
const schema93 = {"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"inspect","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"home","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"name":{"type":"string"},"operation":{"const":"save-layout","type":"string"}},"required":["operation","fleet","name"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"name":{"type":"string"},"operation":{"const":"load-layout","type":"string"}},"required":["operation","fleet","name"],"type":"object"},{"additionalProperties":false,"properties":{"cwd":{"type":"string"},"name":{"type":"string"},"operation":{"const":"create-voyage","type":"string"}},"required":["operation","name","cwd"],"type":"object"},{"additionalProperties":false,"properties":{"name":{"type":"string"},"operation":{"const":"create-fleet","type":"string"},"voyage":{"type":"string"}},"required":["operation","voyage","name"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"create-portal","type":"string"},"voyage":{"type":"string"}},"required":["operation","voyage"],"type":"object"},{"additionalProperties":false,"properties":{"destination":{"$ref":"#/definitions/ContentDestination"},"operation":{"const":"create-content","type":"string"},"typeId":{"type":"string"}},"required":["operation","typeId","destination"],"type":"object"},{"additionalProperties":false,"properties":{"name":{"type":"string"},"operation":{"const":"rename","type":"string"},"target":{"$ref":"#/definitions/RenameTarget"}},"required":["operation","target","name"],"type":"object"},{"additionalProperties":false,"properties":{"after":{"type":"string"},"axis":{"$ref":"#/definitions/Axis"},"fleet":{"type":"string"},"operation":{"const":"split","type":"string"}},"required":["operation","fleet","after","axis"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"operation":{"const":"resize-split","type":"string"},"path":{"items":{"$ref":"#/definitions/SplitChild"},"maxItems":128,"type":"array"},"share":{"$ref":"#/definitions/SplitShare"}},"required":["operation","fleet","path","share"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"move-vessel","type":"string"},"side":{"$ref":"#/definitions/Side"},"target":{"type":"string"}},"required":["operation","id","target","side"],"type":"object"},{"additionalProperties":false,"properties":{"before":{"type":"boolean"},"id":{"type":"string"},"operation":{"const":"move-voyage","type":"string"},"target":{"type":"string"}},"required":["operation","id","target","before"],"type":"object"},{"additionalProperties":false,"properties":{"before":{"type":"boolean"},"id":{"type":"string"},"operation":{"const":"move-fleet","type":"string"},"target":{"type":"string"}},"required":["operation","id","target","before"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"select-voyage","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"select-fleet","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"reveal-vessel","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"context":{"$ref":"#/definitions/Context"},"operation":{"const":"dock","type":"string"}},"required":["operation","context"],"type":"object"}]};
const schema96 = {"oneOf":[{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]};
const schema95 = {"enum":["horizontal","vertical"],"type":"string"};
const schema98 = {"enum":["first","second"],"type":"string"};
const schema99 = {"maximum":9999,"minimum":1,"type":"integer"};
const schema100 = {"enum":["left","right","top","bottom"],"type":"string"};
const schema101 = {"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"workspace","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]};
const schema94 = {"oneOf":[{"additionalProperties":false,"properties":{"after":{"type":"string"},"axis":{"$ref":"#/definitions/Axis"},"fleet":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","fleet","after","axis"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"portal","type":"string"},"voyage":{"type":"string"}},"required":["kind","voyage"],"type":"object"}]};

function validate59(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(errors === _errs1){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((((data.kind === undefined) && (missing0 = "kind")) || ((data.fleet === undefined) && (missing0 = "fleet"))) || ((data.after === undefined) && (missing0 = "after"))) || ((data.axis === undefined) && (missing0 = "axis"))){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
else {
const _errs3 = errors;
for(const key0 in data){
if(!((((key0 === "after") || (key0 === "axis")) || (key0 === "fleet")) || (key0 === "kind"))){
const err1 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
break;
}
}
if(_errs3 === errors){
if(data.after !== undefined){
const _errs4 = errors;
if(typeof data.after !== "string"){
const err2 = {instancePath:instancePath+"/after",schemaPath:"#/oneOf/0/properties/after/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
var valid1 = _errs4 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.axis !== undefined){
let data1 = data.axis;
const _errs6 = errors;
if(typeof data1 !== "string"){
const err3 = {instancePath:instancePath+"/axis",schemaPath:"#/definitions/Axis/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(!((data1 === "horizontal") || (data1 === "vertical"))){
const err4 = {instancePath:instancePath+"/axis",schemaPath:"#/definitions/Axis/enum",keyword:"enum",params:{allowedValues: schema95.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
var valid1 = _errs6 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.fleet !== undefined){
const _errs9 = errors;
if(typeof data.fleet !== "string"){
const err5 = {instancePath:instancePath+"/fleet",schemaPath:"#/oneOf/0/properties/fleet/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
var valid1 = _errs9 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.kind !== undefined){
let data3 = data.kind;
const _errs11 = errors;
if(typeof data3 !== "string"){
const err6 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if("vessel" !== data3){
const err7 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
var valid1 = _errs11 === errors;
}
else {
var valid1 = true;
}
}
}
}
}
}
}
else {
const err8 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
}
const _errs13 = errors;
if(errors === _errs13){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing1;
if(((data.kind === undefined) && (missing1 = "kind")) || ((data.voyage === undefined) && (missing1 = "voyage"))){
const err9 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
else {
const _errs15 = errors;
for(const key1 in data){
if(!((key1 === "kind") || (key1 === "voyage"))){
const err10 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
break;
}
}
if(_errs15 === errors){
if(data.kind !== undefined){
let data4 = data.kind;
const _errs16 = errors;
if(typeof data4 !== "string"){
const err11 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if("portal" !== data4){
const err12 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "portal"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
var valid3 = _errs16 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data.voyage !== undefined){
const _errs18 = errors;
if(typeof data.voyage !== "string"){
const err13 = {instancePath:instancePath+"/voyage",schemaPath:"#/oneOf/1/properties/voyage/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
var valid3 = _errs18 === errors;
}
else {
var valid3 = true;
}
}
}
}
}
else {
const err14 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
var _valid0 = _errs13 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
}
}
if(!valid0){
const err15 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
validate59.errors = vErrors;
return false;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate59.errors = vErrors;
return errors === 0;
}


function validate58(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(errors === _errs1){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((data.operation === undefined) && (missing0 = "operation")){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
else {
const _errs3 = errors;
for(const key0 in data){
if(!(key0 === "operation")){
const err1 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
break;
}
}
if(_errs3 === errors){
if(data.operation !== undefined){
let data0 = data.operation;
if(typeof data0 !== "string"){
const err2 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/0/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if("inspect" !== data0){
const err3 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/0/properties/operation/const",keyword:"const",params:{allowedValue: "inspect"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
}
}
}
else {
const err4 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
}
const _errs6 = errors;
if(errors === _errs6){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing1;
if((data.operation === undefined) && (missing1 = "operation")){
const err5 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
else {
const _errs8 = errors;
for(const key1 in data){
if(!(key1 === "operation")){
const err6 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
break;
}
}
if(_errs8 === errors){
if(data.operation !== undefined){
let data1 = data.operation;
if(typeof data1 !== "string"){
const err7 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/1/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if("home" !== data1){
const err8 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/1/properties/operation/const",keyword:"const",params:{allowedValue: "home"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
}
}
}
else {
const err9 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
var _valid0 = _errs6 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
}
const _errs11 = errors;
if(errors === _errs11){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing2;
if((((data.operation === undefined) && (missing2 = "operation")) || ((data.fleet === undefined) && (missing2 = "fleet"))) || ((data.name === undefined) && (missing2 = "name"))){
const err10 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
else {
const _errs13 = errors;
for(const key2 in data){
if(!(((key2 === "fleet") || (key2 === "name")) || (key2 === "operation"))){
const err11 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
break;
}
}
if(_errs13 === errors){
if(data.fleet !== undefined){
const _errs14 = errors;
if(typeof data.fleet !== "string"){
const err12 = {instancePath:instancePath+"/fleet",schemaPath:"#/oneOf/2/properties/fleet/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
var valid3 = _errs14 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data.name !== undefined){
const _errs16 = errors;
if(typeof data.name !== "string"){
const err13 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/2/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
var valid3 = _errs16 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data.operation !== undefined){
let data4 = data.operation;
const _errs18 = errors;
if(typeof data4 !== "string"){
const err14 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/2/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if("save-layout" !== data4){
const err15 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/2/properties/operation/const",keyword:"const",params:{allowedValue: "save-layout"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
var valid3 = _errs18 === errors;
}
else {
var valid3 = true;
}
}
}
}
}
}
else {
const err16 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
var _valid0 = _errs11 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
}
const _errs20 = errors;
if(errors === _errs20){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing3;
if((((data.operation === undefined) && (missing3 = "operation")) || ((data.fleet === undefined) && (missing3 = "fleet"))) || ((data.name === undefined) && (missing3 = "name"))){
const err17 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: missing3},message:"must have required property '"+missing3+"'"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
else {
const _errs22 = errors;
for(const key3 in data){
if(!(((key3 === "fleet") || (key3 === "name")) || (key3 === "operation"))){
const err18 = {instancePath,schemaPath:"#/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
break;
}
}
if(_errs22 === errors){
if(data.fleet !== undefined){
const _errs23 = errors;
if(typeof data.fleet !== "string"){
const err19 = {instancePath:instancePath+"/fleet",schemaPath:"#/oneOf/3/properties/fleet/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
var valid4 = _errs23 === errors;
}
else {
var valid4 = true;
}
if(valid4){
if(data.name !== undefined){
const _errs25 = errors;
if(typeof data.name !== "string"){
const err20 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/3/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
var valid4 = _errs25 === errors;
}
else {
var valid4 = true;
}
if(valid4){
if(data.operation !== undefined){
let data7 = data.operation;
const _errs27 = errors;
if(typeof data7 !== "string"){
const err21 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/3/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if("load-layout" !== data7){
const err22 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/3/properties/operation/const",keyword:"const",params:{allowedValue: "load-layout"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
var valid4 = _errs27 === errors;
}
else {
var valid4 = true;
}
}
}
}
}
}
else {
const err23 = {instancePath,schemaPath:"#/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
var _valid0 = _errs20 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid0 = true;
passing0 = 3;
}
const _errs29 = errors;
if(errors === _errs29){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing4;
if((((data.operation === undefined) && (missing4 = "operation")) || ((data.name === undefined) && (missing4 = "name"))) || ((data.cwd === undefined) && (missing4 = "cwd"))){
const err24 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: missing4},message:"must have required property '"+missing4+"'"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
else {
const _errs31 = errors;
for(const key4 in data){
if(!(((key4 === "cwd") || (key4 === "name")) || (key4 === "operation"))){
const err25 = {instancePath,schemaPath:"#/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
break;
}
}
if(_errs31 === errors){
if(data.cwd !== undefined){
const _errs32 = errors;
if(typeof data.cwd !== "string"){
const err26 = {instancePath:instancePath+"/cwd",schemaPath:"#/oneOf/4/properties/cwd/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
var valid5 = _errs32 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data.name !== undefined){
const _errs34 = errors;
if(typeof data.name !== "string"){
const err27 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/4/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
var valid5 = _errs34 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data.operation !== undefined){
let data10 = data.operation;
const _errs36 = errors;
if(typeof data10 !== "string"){
const err28 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/4/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if("create-voyage" !== data10){
const err29 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/4/properties/operation/const",keyword:"const",params:{allowedValue: "create-voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
var valid5 = _errs36 === errors;
}
else {
var valid5 = true;
}
}
}
}
}
}
else {
const err30 = {instancePath,schemaPath:"#/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
var _valid0 = _errs29 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 4];
}
else {
if(_valid0){
valid0 = true;
passing0 = 4;
}
const _errs38 = errors;
if(errors === _errs38){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing5;
if((((data.operation === undefined) && (missing5 = "operation")) || ((data.voyage === undefined) && (missing5 = "voyage"))) || ((data.name === undefined) && (missing5 = "name"))){
const err31 = {instancePath,schemaPath:"#/oneOf/5/required",keyword:"required",params:{missingProperty: missing5},message:"must have required property '"+missing5+"'"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
else {
const _errs40 = errors;
for(const key5 in data){
if(!(((key5 === "name") || (key5 === "operation")) || (key5 === "voyage"))){
const err32 = {instancePath,schemaPath:"#/oneOf/5/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
break;
}
}
if(_errs40 === errors){
if(data.name !== undefined){
const _errs41 = errors;
if(typeof data.name !== "string"){
const err33 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/5/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
var valid6 = _errs41 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data.operation !== undefined){
let data12 = data.operation;
const _errs43 = errors;
if(typeof data12 !== "string"){
const err34 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/5/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
if("create-fleet" !== data12){
const err35 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/5/properties/operation/const",keyword:"const",params:{allowedValue: "create-fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
var valid6 = _errs43 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data.voyage !== undefined){
const _errs45 = errors;
if(typeof data.voyage !== "string"){
const err36 = {instancePath:instancePath+"/voyage",schemaPath:"#/oneOf/5/properties/voyage/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
var valid6 = _errs45 === errors;
}
else {
var valid6 = true;
}
}
}
}
}
}
else {
const err37 = {instancePath,schemaPath:"#/oneOf/5/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
var _valid0 = _errs38 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 5];
}
else {
if(_valid0){
valid0 = true;
passing0 = 5;
}
const _errs47 = errors;
if(errors === _errs47){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing6;
if(((data.operation === undefined) && (missing6 = "operation")) || ((data.voyage === undefined) && (missing6 = "voyage"))){
const err38 = {instancePath,schemaPath:"#/oneOf/6/required",keyword:"required",params:{missingProperty: missing6},message:"must have required property '"+missing6+"'"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
else {
const _errs49 = errors;
for(const key6 in data){
if(!((key6 === "operation") || (key6 === "voyage"))){
const err39 = {instancePath,schemaPath:"#/oneOf/6/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
break;
}
}
if(_errs49 === errors){
if(data.operation !== undefined){
let data14 = data.operation;
const _errs50 = errors;
if(typeof data14 !== "string"){
const err40 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/6/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
if("create-portal" !== data14){
const err41 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/6/properties/operation/const",keyword:"const",params:{allowedValue: "create-portal"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
var valid7 = _errs50 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data.voyage !== undefined){
const _errs52 = errors;
if(typeof data.voyage !== "string"){
const err42 = {instancePath:instancePath+"/voyage",schemaPath:"#/oneOf/6/properties/voyage/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
var valid7 = _errs52 === errors;
}
else {
var valid7 = true;
}
}
}
}
}
else {
const err43 = {instancePath,schemaPath:"#/oneOf/6/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
var _valid0 = _errs47 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 6];
}
else {
if(_valid0){
valid0 = true;
passing0 = 6;
}
const _errs54 = errors;
if(errors === _errs54){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing7;
if((((data.operation === undefined) && (missing7 = "operation")) || ((data.typeId === undefined) && (missing7 = "typeId"))) || ((data.destination === undefined) && (missing7 = "destination"))){
const err44 = {instancePath,schemaPath:"#/oneOf/7/required",keyword:"required",params:{missingProperty: missing7},message:"must have required property '"+missing7+"'"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
else {
const _errs56 = errors;
for(const key7 in data){
if(!(((key7 === "destination") || (key7 === "operation")) || (key7 === "typeId"))){
const err45 = {instancePath,schemaPath:"#/oneOf/7/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key7},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
break;
}
}
if(_errs56 === errors){
if(data.destination !== undefined){
const _errs57 = errors;
if(!(validate59(data.destination, {instancePath:instancePath+"/destination",parentData:data,parentDataProperty:"destination",rootData}))){
vErrors = vErrors === null ? validate59.errors : vErrors.concat(validate59.errors);
errors = vErrors.length;
}
var valid8 = _errs57 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data.operation !== undefined){
let data17 = data.operation;
const _errs58 = errors;
if(typeof data17 !== "string"){
const err46 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/7/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
if("create-content" !== data17){
const err47 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/7/properties/operation/const",keyword:"const",params:{allowedValue: "create-content"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
var valid8 = _errs58 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data.typeId !== undefined){
const _errs60 = errors;
if(typeof data.typeId !== "string"){
const err48 = {instancePath:instancePath+"/typeId",schemaPath:"#/oneOf/7/properties/typeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
var valid8 = _errs60 === errors;
}
else {
var valid8 = true;
}
}
}
}
}
}
else {
const err49 = {instancePath,schemaPath:"#/oneOf/7/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
var _valid0 = _errs54 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 7];
}
else {
if(_valid0){
valid0 = true;
passing0 = 7;
}
const _errs62 = errors;
if(errors === _errs62){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing8;
if((((data.operation === undefined) && (missing8 = "operation")) || ((data.target === undefined) && (missing8 = "target"))) || ((data.name === undefined) && (missing8 = "name"))){
const err50 = {instancePath,schemaPath:"#/oneOf/8/required",keyword:"required",params:{missingProperty: missing8},message:"must have required property '"+missing8+"'"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
else {
const _errs64 = errors;
for(const key8 in data){
if(!(((key8 === "name") || (key8 === "operation")) || (key8 === "target"))){
const err51 = {instancePath,schemaPath:"#/oneOf/8/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key8},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
break;
}
}
if(_errs64 === errors){
if(data.name !== undefined){
const _errs65 = errors;
if(typeof data.name !== "string"){
const err52 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/8/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
var valid9 = _errs65 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data.operation !== undefined){
let data20 = data.operation;
const _errs67 = errors;
if(typeof data20 !== "string"){
const err53 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/8/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
if("rename" !== data20){
const err54 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/8/properties/operation/const",keyword:"const",params:{allowedValue: "rename"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
var valid9 = _errs67 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data.target !== undefined){
let data21 = data.target;
const _errs69 = errors;
const _errs71 = errors;
let valid11 = false;
let passing1 = null;
const _errs72 = errors;
if(errors === _errs72){
if(data21 && typeof data21 == "object" && !Array.isArray(data21)){
let missing9;
if(((data21.kind === undefined) && (missing9 = "kind")) || ((data21.id === undefined) && (missing9 = "id"))){
const err55 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/0/required",keyword:"required",params:{missingProperty: missing9},message:"must have required property '"+missing9+"'"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
else {
const _errs74 = errors;
for(const key9 in data21){
if(!((key9 === "id") || (key9 === "kind"))){
const err56 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key9},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
break;
}
}
if(_errs74 === errors){
if(data21.id !== undefined){
const _errs75 = errors;
if(typeof data21.id !== "string"){
const err57 = {instancePath:instancePath+"/target/id",schemaPath:"#/definitions/RenameTarget/oneOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
var valid12 = _errs75 === errors;
}
else {
var valid12 = true;
}
if(valid12){
if(data21.kind !== undefined){
let data23 = data21.kind;
const _errs77 = errors;
if(typeof data23 !== "string"){
const err58 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
if("voyage" !== data23){
const err59 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
var valid12 = _errs77 === errors;
}
else {
var valid12 = true;
}
}
}
}
}
else {
const err60 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
var _valid1 = _errs72 === errors;
if(_valid1){
valid11 = true;
passing1 = 0;
}
const _errs79 = errors;
if(errors === _errs79){
if(data21 && typeof data21 == "object" && !Array.isArray(data21)){
let missing10;
if(((data21.kind === undefined) && (missing10 = "kind")) || ((data21.id === undefined) && (missing10 = "id"))){
const err61 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/1/required",keyword:"required",params:{missingProperty: missing10},message:"must have required property '"+missing10+"'"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
else {
const _errs81 = errors;
for(const key10 in data21){
if(!((key10 === "id") || (key10 === "kind"))){
const err62 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key10},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
break;
}
}
if(_errs81 === errors){
if(data21.id !== undefined){
const _errs82 = errors;
if(typeof data21.id !== "string"){
const err63 = {instancePath:instancePath+"/target/id",schemaPath:"#/definitions/RenameTarget/oneOf/1/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
var valid13 = _errs82 === errors;
}
else {
var valid13 = true;
}
if(valid13){
if(data21.kind !== undefined){
let data25 = data21.kind;
const _errs84 = errors;
if(typeof data25 !== "string"){
const err64 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
if("fleet" !== data25){
const err65 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
var valid13 = _errs84 === errors;
}
else {
var valid13 = true;
}
}
}
}
}
else {
const err66 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
}
var _valid1 = _errs79 === errors;
if(_valid1 && valid11){
valid11 = false;
passing1 = [passing1, 1];
}
else {
if(_valid1){
valid11 = true;
passing1 = 1;
}
const _errs86 = errors;
if(errors === _errs86){
if(data21 && typeof data21 == "object" && !Array.isArray(data21)){
let missing11;
if(((data21.kind === undefined) && (missing11 = "kind")) || ((data21.id === undefined) && (missing11 = "id"))){
const err67 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/2/required",keyword:"required",params:{missingProperty: missing11},message:"must have required property '"+missing11+"'"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
else {
const _errs88 = errors;
for(const key11 in data21){
if(!((key11 === "id") || (key11 === "kind"))){
const err68 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key11},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
break;
}
}
if(_errs88 === errors){
if(data21.id !== undefined){
const _errs89 = errors;
if(typeof data21.id !== "string"){
const err69 = {instancePath:instancePath+"/target/id",schemaPath:"#/definitions/RenameTarget/oneOf/2/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
var valid14 = _errs89 === errors;
}
else {
var valid14 = true;
}
if(valid14){
if(data21.kind !== undefined){
let data27 = data21.kind;
const _errs91 = errors;
if(typeof data27 !== "string"){
const err70 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
if("vessel" !== data27){
const err71 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
var valid14 = _errs91 === errors;
}
else {
var valid14 = true;
}
}
}
}
}
else {
const err72 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
}
var _valid1 = _errs86 === errors;
if(_valid1 && valid11){
valid11 = false;
passing1 = [passing1, 2];
}
else {
if(_valid1){
valid11 = true;
passing1 = 2;
}
const _errs93 = errors;
if(errors === _errs93){
if(data21 && typeof data21 == "object" && !Array.isArray(data21)){
let missing12;
if(((data21.kind === undefined) && (missing12 = "kind")) || ((data21.id === undefined) && (missing12 = "id"))){
const err73 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/3/required",keyword:"required",params:{missingProperty: missing12},message:"must have required property '"+missing12+"'"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
else {
const _errs95 = errors;
for(const key12 in data21){
if(!((key12 === "id") || (key12 === "kind"))){
const err74 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key12},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
break;
}
}
if(_errs95 === errors){
if(data21.id !== undefined){
const _errs96 = errors;
if(typeof data21.id !== "string"){
const err75 = {instancePath:instancePath+"/target/id",schemaPath:"#/definitions/RenameTarget/oneOf/3/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
var valid15 = _errs96 === errors;
}
else {
var valid15 = true;
}
if(valid15){
if(data21.kind !== undefined){
let data29 = data21.kind;
const _errs98 = errors;
if(typeof data29 !== "string"){
const err76 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/3/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
if("portal" !== data29){
const err77 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/3/properties/kind/const",keyword:"const",params:{allowedValue: "portal"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
var valid15 = _errs98 === errors;
}
else {
var valid15 = true;
}
}
}
}
}
else {
const err78 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
}
var _valid1 = _errs93 === errors;
if(_valid1 && valid11){
valid11 = false;
passing1 = [passing1, 3];
}
else {
if(_valid1){
valid11 = true;
passing1 = 3;
}
}
}
}
if(!valid11){
const err79 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf",keyword:"oneOf",params:{passingSchemas: passing1},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
else {
errors = _errs71;
if(vErrors !== null){
if(_errs71){
vErrors.length = _errs71;
}
else {
vErrors = null;
}
}
}
var valid9 = _errs69 === errors;
}
else {
var valid9 = true;
}
}
}
}
}
}
else {
const err80 = {instancePath,schemaPath:"#/oneOf/8/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
}
var _valid0 = _errs62 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 8];
}
else {
if(_valid0){
valid0 = true;
passing0 = 8;
}
const _errs100 = errors;
if(errors === _errs100){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing13;
if(((((data.operation === undefined) && (missing13 = "operation")) || ((data.fleet === undefined) && (missing13 = "fleet"))) || ((data.after === undefined) && (missing13 = "after"))) || ((data.axis === undefined) && (missing13 = "axis"))){
const err81 = {instancePath,schemaPath:"#/oneOf/9/required",keyword:"required",params:{missingProperty: missing13},message:"must have required property '"+missing13+"'"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
else {
const _errs102 = errors;
for(const key13 in data){
if(!((((key13 === "after") || (key13 === "axis")) || (key13 === "fleet")) || (key13 === "operation"))){
const err82 = {instancePath,schemaPath:"#/oneOf/9/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key13},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
break;
}
}
if(_errs102 === errors){
if(data.after !== undefined){
const _errs103 = errors;
if(typeof data.after !== "string"){
const err83 = {instancePath:instancePath+"/after",schemaPath:"#/oneOf/9/properties/after/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
var valid16 = _errs103 === errors;
}
else {
var valid16 = true;
}
if(valid16){
if(data.axis !== undefined){
let data31 = data.axis;
const _errs105 = errors;
if(typeof data31 !== "string"){
const err84 = {instancePath:instancePath+"/axis",schemaPath:"#/definitions/Axis/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
if(!((data31 === "horizontal") || (data31 === "vertical"))){
const err85 = {instancePath:instancePath+"/axis",schemaPath:"#/definitions/Axis/enum",keyword:"enum",params:{allowedValues: schema95.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
var valid16 = _errs105 === errors;
}
else {
var valid16 = true;
}
if(valid16){
if(data.fleet !== undefined){
const _errs108 = errors;
if(typeof data.fleet !== "string"){
const err86 = {instancePath:instancePath+"/fleet",schemaPath:"#/oneOf/9/properties/fleet/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
var valid16 = _errs108 === errors;
}
else {
var valid16 = true;
}
if(valid16){
if(data.operation !== undefined){
let data33 = data.operation;
const _errs110 = errors;
if(typeof data33 !== "string"){
const err87 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/9/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
if("split" !== data33){
const err88 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/9/properties/operation/const",keyword:"const",params:{allowedValue: "split"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
var valid16 = _errs110 === errors;
}
else {
var valid16 = true;
}
}
}
}
}
}
}
else {
const err89 = {instancePath,schemaPath:"#/oneOf/9/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
}
var _valid0 = _errs100 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 9];
}
else {
if(_valid0){
valid0 = true;
passing0 = 9;
}
const _errs112 = errors;
if(errors === _errs112){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing14;
if(((((data.operation === undefined) && (missing14 = "operation")) || ((data.fleet === undefined) && (missing14 = "fleet"))) || ((data.path === undefined) && (missing14 = "path"))) || ((data.share === undefined) && (missing14 = "share"))){
const err90 = {instancePath,schemaPath:"#/oneOf/10/required",keyword:"required",params:{missingProperty: missing14},message:"must have required property '"+missing14+"'"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
else {
const _errs114 = errors;
for(const key14 in data){
if(!((((key14 === "fleet") || (key14 === "operation")) || (key14 === "path")) || (key14 === "share"))){
const err91 = {instancePath,schemaPath:"#/oneOf/10/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key14},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
break;
}
}
if(_errs114 === errors){
if(data.fleet !== undefined){
const _errs115 = errors;
if(typeof data.fleet !== "string"){
const err92 = {instancePath:instancePath+"/fleet",schemaPath:"#/oneOf/10/properties/fleet/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
var valid18 = _errs115 === errors;
}
else {
var valid18 = true;
}
if(valid18){
if(data.operation !== undefined){
let data35 = data.operation;
const _errs117 = errors;
if(typeof data35 !== "string"){
const err93 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/10/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err93];
}
else {
vErrors.push(err93);
}
errors++;
}
if("resize-split" !== data35){
const err94 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/10/properties/operation/const",keyword:"const",params:{allowedValue: "resize-split"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
var valid18 = _errs117 === errors;
}
else {
var valid18 = true;
}
if(valid18){
if(data.path !== undefined){
let data36 = data.path;
const _errs119 = errors;
if(errors === _errs119){
if(Array.isArray(data36)){
if(data36.length > 128){
const err95 = {instancePath:instancePath+"/path",schemaPath:"#/oneOf/10/properties/path/maxItems",keyword:"maxItems",params:{limit: 128},message:"must NOT have more than 128 items"};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
else {
var valid19 = true;
const len0 = data36.length;
for(let i0=0; i0<len0; i0++){
let data37 = data36[i0];
const _errs121 = errors;
if(typeof data37 !== "string"){
const err96 = {instancePath:instancePath+"/path/" + i0,schemaPath:"#/definitions/SplitChild/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
if(!((data37 === "first") || (data37 === "second"))){
const err97 = {instancePath:instancePath+"/path/" + i0,schemaPath:"#/definitions/SplitChild/enum",keyword:"enum",params:{allowedValues: schema98.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
var valid19 = _errs121 === errors;
if(!valid19){
break;
}
}
}
}
else {
const err98 = {instancePath:instancePath+"/path",schemaPath:"#/oneOf/10/properties/path/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err98];
}
else {
vErrors.push(err98);
}
errors++;
}
}
var valid18 = _errs119 === errors;
}
else {
var valid18 = true;
}
if(valid18){
if(data.share !== undefined){
let data38 = data.share;
const _errs124 = errors;
const _errs125 = errors;
if(!(((typeof data38 == "number") && (!(data38 % 1) && !isNaN(data38))) && (isFinite(data38)))){
const err99 = {instancePath:instancePath+"/share",schemaPath:"#/definitions/SplitShare/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err99];
}
else {
vErrors.push(err99);
}
errors++;
}
if(errors === _errs125){
if((typeof data38 == "number") && (isFinite(data38))){
if(data38 > 9999 || isNaN(data38)){
const err100 = {instancePath:instancePath+"/share",schemaPath:"#/definitions/SplitShare/maximum",keyword:"maximum",params:{comparison: "<=", limit: 9999},message:"must be <= 9999"};
if(vErrors === null){
vErrors = [err100];
}
else {
vErrors.push(err100);
}
errors++;
}
else {
if(data38 < 1 || isNaN(data38)){
const err101 = {instancePath:instancePath+"/share",schemaPath:"#/definitions/SplitShare/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err101];
}
else {
vErrors.push(err101);
}
errors++;
}
}
}
}
var valid18 = _errs124 === errors;
}
else {
var valid18 = true;
}
}
}
}
}
}
}
else {
const err102 = {instancePath,schemaPath:"#/oneOf/10/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err102];
}
else {
vErrors.push(err102);
}
errors++;
}
}
var _valid0 = _errs112 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 10];
}
else {
if(_valid0){
valid0 = true;
passing0 = 10;
}
const _errs127 = errors;
if(errors === _errs127){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing15;
if(((((data.operation === undefined) && (missing15 = "operation")) || ((data.id === undefined) && (missing15 = "id"))) || ((data.target === undefined) && (missing15 = "target"))) || ((data.side === undefined) && (missing15 = "side"))){
const err103 = {instancePath,schemaPath:"#/oneOf/11/required",keyword:"required",params:{missingProperty: missing15},message:"must have required property '"+missing15+"'"};
if(vErrors === null){
vErrors = [err103];
}
else {
vErrors.push(err103);
}
errors++;
}
else {
const _errs129 = errors;
for(const key15 in data){
if(!((((key15 === "id") || (key15 === "operation")) || (key15 === "side")) || (key15 === "target"))){
const err104 = {instancePath,schemaPath:"#/oneOf/11/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key15},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err104];
}
else {
vErrors.push(err104);
}
errors++;
break;
}
}
if(_errs129 === errors){
if(data.id !== undefined){
const _errs130 = errors;
if(typeof data.id !== "string"){
const err105 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/11/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err105];
}
else {
vErrors.push(err105);
}
errors++;
}
var valid22 = _errs130 === errors;
}
else {
var valid22 = true;
}
if(valid22){
if(data.operation !== undefined){
let data40 = data.operation;
const _errs132 = errors;
if(typeof data40 !== "string"){
const err106 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/11/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err106];
}
else {
vErrors.push(err106);
}
errors++;
}
if("move-vessel" !== data40){
const err107 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/11/properties/operation/const",keyword:"const",params:{allowedValue: "move-vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err107];
}
else {
vErrors.push(err107);
}
errors++;
}
var valid22 = _errs132 === errors;
}
else {
var valid22 = true;
}
if(valid22){
if(data.side !== undefined){
let data41 = data.side;
const _errs134 = errors;
if(typeof data41 !== "string"){
const err108 = {instancePath:instancePath+"/side",schemaPath:"#/definitions/Side/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err108];
}
else {
vErrors.push(err108);
}
errors++;
}
if(!((((data41 === "left") || (data41 === "right")) || (data41 === "top")) || (data41 === "bottom"))){
const err109 = {instancePath:instancePath+"/side",schemaPath:"#/definitions/Side/enum",keyword:"enum",params:{allowedValues: schema100.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err109];
}
else {
vErrors.push(err109);
}
errors++;
}
var valid22 = _errs134 === errors;
}
else {
var valid22 = true;
}
if(valid22){
if(data.target !== undefined){
const _errs137 = errors;
if(typeof data.target !== "string"){
const err110 = {instancePath:instancePath+"/target",schemaPath:"#/oneOf/11/properties/target/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err110];
}
else {
vErrors.push(err110);
}
errors++;
}
var valid22 = _errs137 === errors;
}
else {
var valid22 = true;
}
}
}
}
}
}
}
else {
const err111 = {instancePath,schemaPath:"#/oneOf/11/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err111];
}
else {
vErrors.push(err111);
}
errors++;
}
}
var _valid0 = _errs127 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 11];
}
else {
if(_valid0){
valid0 = true;
passing0 = 11;
}
const _errs139 = errors;
if(errors === _errs139){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing16;
if(((((data.operation === undefined) && (missing16 = "operation")) || ((data.id === undefined) && (missing16 = "id"))) || ((data.target === undefined) && (missing16 = "target"))) || ((data.before === undefined) && (missing16 = "before"))){
const err112 = {instancePath,schemaPath:"#/oneOf/12/required",keyword:"required",params:{missingProperty: missing16},message:"must have required property '"+missing16+"'"};
if(vErrors === null){
vErrors = [err112];
}
else {
vErrors.push(err112);
}
errors++;
}
else {
const _errs141 = errors;
for(const key16 in data){
if(!((((key16 === "before") || (key16 === "id")) || (key16 === "operation")) || (key16 === "target"))){
const err113 = {instancePath,schemaPath:"#/oneOf/12/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key16},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err113];
}
else {
vErrors.push(err113);
}
errors++;
break;
}
}
if(_errs141 === errors){
if(data.before !== undefined){
const _errs142 = errors;
if(typeof data.before !== "boolean"){
const err114 = {instancePath:instancePath+"/before",schemaPath:"#/oneOf/12/properties/before/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err114];
}
else {
vErrors.push(err114);
}
errors++;
}
var valid24 = _errs142 === errors;
}
else {
var valid24 = true;
}
if(valid24){
if(data.id !== undefined){
const _errs144 = errors;
if(typeof data.id !== "string"){
const err115 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/12/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err115];
}
else {
vErrors.push(err115);
}
errors++;
}
var valid24 = _errs144 === errors;
}
else {
var valid24 = true;
}
if(valid24){
if(data.operation !== undefined){
let data45 = data.operation;
const _errs146 = errors;
if(typeof data45 !== "string"){
const err116 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/12/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err116];
}
else {
vErrors.push(err116);
}
errors++;
}
if("move-voyage" !== data45){
const err117 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/12/properties/operation/const",keyword:"const",params:{allowedValue: "move-voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err117];
}
else {
vErrors.push(err117);
}
errors++;
}
var valid24 = _errs146 === errors;
}
else {
var valid24 = true;
}
if(valid24){
if(data.target !== undefined){
const _errs148 = errors;
if(typeof data.target !== "string"){
const err118 = {instancePath:instancePath+"/target",schemaPath:"#/oneOf/12/properties/target/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err118];
}
else {
vErrors.push(err118);
}
errors++;
}
var valid24 = _errs148 === errors;
}
else {
var valid24 = true;
}
}
}
}
}
}
}
else {
const err119 = {instancePath,schemaPath:"#/oneOf/12/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err119];
}
else {
vErrors.push(err119);
}
errors++;
}
}
var _valid0 = _errs139 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 12];
}
else {
if(_valid0){
valid0 = true;
passing0 = 12;
}
const _errs150 = errors;
if(errors === _errs150){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing17;
if(((((data.operation === undefined) && (missing17 = "operation")) || ((data.id === undefined) && (missing17 = "id"))) || ((data.target === undefined) && (missing17 = "target"))) || ((data.before === undefined) && (missing17 = "before"))){
const err120 = {instancePath,schemaPath:"#/oneOf/13/required",keyword:"required",params:{missingProperty: missing17},message:"must have required property '"+missing17+"'"};
if(vErrors === null){
vErrors = [err120];
}
else {
vErrors.push(err120);
}
errors++;
}
else {
const _errs152 = errors;
for(const key17 in data){
if(!((((key17 === "before") || (key17 === "id")) || (key17 === "operation")) || (key17 === "target"))){
const err121 = {instancePath,schemaPath:"#/oneOf/13/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key17},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err121];
}
else {
vErrors.push(err121);
}
errors++;
break;
}
}
if(_errs152 === errors){
if(data.before !== undefined){
const _errs153 = errors;
if(typeof data.before !== "boolean"){
const err122 = {instancePath:instancePath+"/before",schemaPath:"#/oneOf/13/properties/before/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err122];
}
else {
vErrors.push(err122);
}
errors++;
}
var valid25 = _errs153 === errors;
}
else {
var valid25 = true;
}
if(valid25){
if(data.id !== undefined){
const _errs155 = errors;
if(typeof data.id !== "string"){
const err123 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/13/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err123];
}
else {
vErrors.push(err123);
}
errors++;
}
var valid25 = _errs155 === errors;
}
else {
var valid25 = true;
}
if(valid25){
if(data.operation !== undefined){
let data49 = data.operation;
const _errs157 = errors;
if(typeof data49 !== "string"){
const err124 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/13/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err124];
}
else {
vErrors.push(err124);
}
errors++;
}
if("move-fleet" !== data49){
const err125 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/13/properties/operation/const",keyword:"const",params:{allowedValue: "move-fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err125];
}
else {
vErrors.push(err125);
}
errors++;
}
var valid25 = _errs157 === errors;
}
else {
var valid25 = true;
}
if(valid25){
if(data.target !== undefined){
const _errs159 = errors;
if(typeof data.target !== "string"){
const err126 = {instancePath:instancePath+"/target",schemaPath:"#/oneOf/13/properties/target/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err126];
}
else {
vErrors.push(err126);
}
errors++;
}
var valid25 = _errs159 === errors;
}
else {
var valid25 = true;
}
}
}
}
}
}
}
else {
const err127 = {instancePath,schemaPath:"#/oneOf/13/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err127];
}
else {
vErrors.push(err127);
}
errors++;
}
}
var _valid0 = _errs150 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 13];
}
else {
if(_valid0){
valid0 = true;
passing0 = 13;
}
const _errs161 = errors;
if(errors === _errs161){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing18;
if(((data.operation === undefined) && (missing18 = "operation")) || ((data.id === undefined) && (missing18 = "id"))){
const err128 = {instancePath,schemaPath:"#/oneOf/14/required",keyword:"required",params:{missingProperty: missing18},message:"must have required property '"+missing18+"'"};
if(vErrors === null){
vErrors = [err128];
}
else {
vErrors.push(err128);
}
errors++;
}
else {
const _errs163 = errors;
for(const key18 in data){
if(!((key18 === "id") || (key18 === "operation"))){
const err129 = {instancePath,schemaPath:"#/oneOf/14/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key18},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err129];
}
else {
vErrors.push(err129);
}
errors++;
break;
}
}
if(_errs163 === errors){
if(data.id !== undefined){
const _errs164 = errors;
if(typeof data.id !== "string"){
const err130 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/14/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err130];
}
else {
vErrors.push(err130);
}
errors++;
}
var valid26 = _errs164 === errors;
}
else {
var valid26 = true;
}
if(valid26){
if(data.operation !== undefined){
let data52 = data.operation;
const _errs166 = errors;
if(typeof data52 !== "string"){
const err131 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/14/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err131];
}
else {
vErrors.push(err131);
}
errors++;
}
if("select-voyage" !== data52){
const err132 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/14/properties/operation/const",keyword:"const",params:{allowedValue: "select-voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err132];
}
else {
vErrors.push(err132);
}
errors++;
}
var valid26 = _errs166 === errors;
}
else {
var valid26 = true;
}
}
}
}
}
else {
const err133 = {instancePath,schemaPath:"#/oneOf/14/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err133];
}
else {
vErrors.push(err133);
}
errors++;
}
}
var _valid0 = _errs161 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 14];
}
else {
if(_valid0){
valid0 = true;
passing0 = 14;
}
const _errs168 = errors;
if(errors === _errs168){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing19;
if(((data.operation === undefined) && (missing19 = "operation")) || ((data.id === undefined) && (missing19 = "id"))){
const err134 = {instancePath,schemaPath:"#/oneOf/15/required",keyword:"required",params:{missingProperty: missing19},message:"must have required property '"+missing19+"'"};
if(vErrors === null){
vErrors = [err134];
}
else {
vErrors.push(err134);
}
errors++;
}
else {
const _errs170 = errors;
for(const key19 in data){
if(!((key19 === "id") || (key19 === "operation"))){
const err135 = {instancePath,schemaPath:"#/oneOf/15/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key19},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err135];
}
else {
vErrors.push(err135);
}
errors++;
break;
}
}
if(_errs170 === errors){
if(data.id !== undefined){
const _errs171 = errors;
if(typeof data.id !== "string"){
const err136 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/15/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err136];
}
else {
vErrors.push(err136);
}
errors++;
}
var valid27 = _errs171 === errors;
}
else {
var valid27 = true;
}
if(valid27){
if(data.operation !== undefined){
let data54 = data.operation;
const _errs173 = errors;
if(typeof data54 !== "string"){
const err137 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/15/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err137];
}
else {
vErrors.push(err137);
}
errors++;
}
if("select-fleet" !== data54){
const err138 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/15/properties/operation/const",keyword:"const",params:{allowedValue: "select-fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err138];
}
else {
vErrors.push(err138);
}
errors++;
}
var valid27 = _errs173 === errors;
}
else {
var valid27 = true;
}
}
}
}
}
else {
const err139 = {instancePath,schemaPath:"#/oneOf/15/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err139];
}
else {
vErrors.push(err139);
}
errors++;
}
}
var _valid0 = _errs168 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 15];
}
else {
if(_valid0){
valid0 = true;
passing0 = 15;
}
const _errs175 = errors;
if(errors === _errs175){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing20;
if(((data.operation === undefined) && (missing20 = "operation")) || ((data.id === undefined) && (missing20 = "id"))){
const err140 = {instancePath,schemaPath:"#/oneOf/16/required",keyword:"required",params:{missingProperty: missing20},message:"must have required property '"+missing20+"'"};
if(vErrors === null){
vErrors = [err140];
}
else {
vErrors.push(err140);
}
errors++;
}
else {
const _errs177 = errors;
for(const key20 in data){
if(!((key20 === "id") || (key20 === "operation"))){
const err141 = {instancePath,schemaPath:"#/oneOf/16/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key20},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err141];
}
else {
vErrors.push(err141);
}
errors++;
break;
}
}
if(_errs177 === errors){
if(data.id !== undefined){
const _errs178 = errors;
if(typeof data.id !== "string"){
const err142 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/16/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err142];
}
else {
vErrors.push(err142);
}
errors++;
}
var valid28 = _errs178 === errors;
}
else {
var valid28 = true;
}
if(valid28){
if(data.operation !== undefined){
let data56 = data.operation;
const _errs180 = errors;
if(typeof data56 !== "string"){
const err143 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/16/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err143];
}
else {
vErrors.push(err143);
}
errors++;
}
if("reveal-vessel" !== data56){
const err144 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/16/properties/operation/const",keyword:"const",params:{allowedValue: "reveal-vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err144];
}
else {
vErrors.push(err144);
}
errors++;
}
var valid28 = _errs180 === errors;
}
else {
var valid28 = true;
}
}
}
}
}
else {
const err145 = {instancePath,schemaPath:"#/oneOf/16/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err145];
}
else {
vErrors.push(err145);
}
errors++;
}
}
var _valid0 = _errs175 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 16];
}
else {
if(_valid0){
valid0 = true;
passing0 = 16;
}
const _errs182 = errors;
if(errors === _errs182){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing21;
if(((data.operation === undefined) && (missing21 = "operation")) || ((data.context === undefined) && (missing21 = "context"))){
const err146 = {instancePath,schemaPath:"#/oneOf/17/required",keyword:"required",params:{missingProperty: missing21},message:"must have required property '"+missing21+"'"};
if(vErrors === null){
vErrors = [err146];
}
else {
vErrors.push(err146);
}
errors++;
}
else {
const _errs184 = errors;
for(const key21 in data){
if(!((key21 === "context") || (key21 === "operation"))){
const err147 = {instancePath,schemaPath:"#/oneOf/17/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key21},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err147];
}
else {
vErrors.push(err147);
}
errors++;
break;
}
}
if(_errs184 === errors){
if(data.context !== undefined){
let data57 = data.context;
const _errs185 = errors;
const _errs187 = errors;
let valid31 = false;
let passing2 = null;
const _errs188 = errors;
if(errors === _errs188){
if(data57 && typeof data57 == "object" && !Array.isArray(data57)){
let missing22;
if((data57.kind === undefined) && (missing22 = "kind")){
const err148 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/0/required",keyword:"required",params:{missingProperty: missing22},message:"must have required property '"+missing22+"'"};
if(vErrors === null){
vErrors = [err148];
}
else {
vErrors.push(err148);
}
errors++;
}
else {
const _errs190 = errors;
for(const key22 in data57){
if(!(key22 === "kind")){
const err149 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key22},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err149];
}
else {
vErrors.push(err149);
}
errors++;
break;
}
}
if(_errs190 === errors){
if(data57.kind !== undefined){
let data58 = data57.kind;
if(typeof data58 !== "string"){
const err150 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err150];
}
else {
vErrors.push(err150);
}
errors++;
}
if("workspace" !== data58){
const err151 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "workspace"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err151];
}
else {
vErrors.push(err151);
}
errors++;
}
}
}
}
}
else {
const err152 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err152];
}
else {
vErrors.push(err152);
}
errors++;
}
}
var _valid2 = _errs188 === errors;
if(_valid2){
valid31 = true;
passing2 = 0;
}
const _errs193 = errors;
if(errors === _errs193){
if(data57 && typeof data57 == "object" && !Array.isArray(data57)){
let missing23;
if(((data57.kind === undefined) && (missing23 = "kind")) || ((data57.id === undefined) && (missing23 = "id"))){
const err153 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/1/required",keyword:"required",params:{missingProperty: missing23},message:"must have required property '"+missing23+"'"};
if(vErrors === null){
vErrors = [err153];
}
else {
vErrors.push(err153);
}
errors++;
}
else {
const _errs195 = errors;
for(const key23 in data57){
if(!((key23 === "id") || (key23 === "kind"))){
const err154 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key23},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err154];
}
else {
vErrors.push(err154);
}
errors++;
break;
}
}
if(_errs195 === errors){
if(data57.id !== undefined){
const _errs196 = errors;
if(typeof data57.id !== "string"){
const err155 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/1/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err155];
}
else {
vErrors.push(err155);
}
errors++;
}
var valid33 = _errs196 === errors;
}
else {
var valid33 = true;
}
if(valid33){
if(data57.kind !== undefined){
let data60 = data57.kind;
const _errs198 = errors;
if(typeof data60 !== "string"){
const err156 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err156];
}
else {
vErrors.push(err156);
}
errors++;
}
if("voyage" !== data60){
const err157 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err157];
}
else {
vErrors.push(err157);
}
errors++;
}
var valid33 = _errs198 === errors;
}
else {
var valid33 = true;
}
}
}
}
}
else {
const err158 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err158];
}
else {
vErrors.push(err158);
}
errors++;
}
}
var _valid2 = _errs193 === errors;
if(_valid2 && valid31){
valid31 = false;
passing2 = [passing2, 1];
}
else {
if(_valid2){
valid31 = true;
passing2 = 1;
}
const _errs200 = errors;
if(errors === _errs200){
if(data57 && typeof data57 == "object" && !Array.isArray(data57)){
let missing24;
if(((data57.kind === undefined) && (missing24 = "kind")) || ((data57.id === undefined) && (missing24 = "id"))){
const err159 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/2/required",keyword:"required",params:{missingProperty: missing24},message:"must have required property '"+missing24+"'"};
if(vErrors === null){
vErrors = [err159];
}
else {
vErrors.push(err159);
}
errors++;
}
else {
const _errs202 = errors;
for(const key24 in data57){
if(!((key24 === "id") || (key24 === "kind"))){
const err160 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key24},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err160];
}
else {
vErrors.push(err160);
}
errors++;
break;
}
}
if(_errs202 === errors){
if(data57.id !== undefined){
const _errs203 = errors;
if(typeof data57.id !== "string"){
const err161 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/2/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err161];
}
else {
vErrors.push(err161);
}
errors++;
}
var valid34 = _errs203 === errors;
}
else {
var valid34 = true;
}
if(valid34){
if(data57.kind !== undefined){
let data62 = data57.kind;
const _errs205 = errors;
if(typeof data62 !== "string"){
const err162 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err162];
}
else {
vErrors.push(err162);
}
errors++;
}
if("fleet" !== data62){
const err163 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err163];
}
else {
vErrors.push(err163);
}
errors++;
}
var valid34 = _errs205 === errors;
}
else {
var valid34 = true;
}
}
}
}
}
else {
const err164 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err164];
}
else {
vErrors.push(err164);
}
errors++;
}
}
var _valid2 = _errs200 === errors;
if(_valid2 && valid31){
valid31 = false;
passing2 = [passing2, 2];
}
else {
if(_valid2){
valid31 = true;
passing2 = 2;
}
const _errs207 = errors;
if(errors === _errs207){
if(data57 && typeof data57 == "object" && !Array.isArray(data57)){
let missing25;
if(((data57.kind === undefined) && (missing25 = "kind")) || ((data57.id === undefined) && (missing25 = "id"))){
const err165 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/3/required",keyword:"required",params:{missingProperty: missing25},message:"must have required property '"+missing25+"'"};
if(vErrors === null){
vErrors = [err165];
}
else {
vErrors.push(err165);
}
errors++;
}
else {
const _errs209 = errors;
for(const key25 in data57){
if(!((key25 === "id") || (key25 === "kind"))){
const err166 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key25},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err166];
}
else {
vErrors.push(err166);
}
errors++;
break;
}
}
if(_errs209 === errors){
if(data57.id !== undefined){
const _errs210 = errors;
if(typeof data57.id !== "string"){
const err167 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/3/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err167];
}
else {
vErrors.push(err167);
}
errors++;
}
var valid35 = _errs210 === errors;
}
else {
var valid35 = true;
}
if(valid35){
if(data57.kind !== undefined){
let data64 = data57.kind;
const _errs212 = errors;
if(typeof data64 !== "string"){
const err168 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/3/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err168];
}
else {
vErrors.push(err168);
}
errors++;
}
if("vessel" !== data64){
const err169 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/3/properties/kind/const",keyword:"const",params:{allowedValue: "vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err169];
}
else {
vErrors.push(err169);
}
errors++;
}
var valid35 = _errs212 === errors;
}
else {
var valid35 = true;
}
}
}
}
}
else {
const err170 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err170];
}
else {
vErrors.push(err170);
}
errors++;
}
}
var _valid2 = _errs207 === errors;
if(_valid2 && valid31){
valid31 = false;
passing2 = [passing2, 3];
}
else {
if(_valid2){
valid31 = true;
passing2 = 3;
}
const _errs214 = errors;
if(errors === _errs214){
if(data57 && typeof data57 == "object" && !Array.isArray(data57)){
let missing26;
if(((data57.kind === undefined) && (missing26 = "kind")) || ((data57.id === undefined) && (missing26 = "id"))){
const err171 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/4/required",keyword:"required",params:{missingProperty: missing26},message:"must have required property '"+missing26+"'"};
if(vErrors === null){
vErrors = [err171];
}
else {
vErrors.push(err171);
}
errors++;
}
else {
const _errs216 = errors;
for(const key26 in data57){
if(!((key26 === "id") || (key26 === "kind"))){
const err172 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key26},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err172];
}
else {
vErrors.push(err172);
}
errors++;
break;
}
}
if(_errs216 === errors){
if(data57.id !== undefined){
const _errs217 = errors;
if(typeof data57.id !== "string"){
const err173 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/4/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err173];
}
else {
vErrors.push(err173);
}
errors++;
}
var valid36 = _errs217 === errors;
}
else {
var valid36 = true;
}
if(valid36){
if(data57.kind !== undefined){
let data66 = data57.kind;
const _errs219 = errors;
if(typeof data66 !== "string"){
const err174 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/4/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err174];
}
else {
vErrors.push(err174);
}
errors++;
}
if("portal" !== data66){
const err175 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/4/properties/kind/const",keyword:"const",params:{allowedValue: "portal"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err175];
}
else {
vErrors.push(err175);
}
errors++;
}
var valid36 = _errs219 === errors;
}
else {
var valid36 = true;
}
}
}
}
}
else {
const err176 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err176];
}
else {
vErrors.push(err176);
}
errors++;
}
}
var _valid2 = _errs214 === errors;
if(_valid2 && valid31){
valid31 = false;
passing2 = [passing2, 4];
}
else {
if(_valid2){
valid31 = true;
passing2 = 4;
}
}
}
}
}
if(!valid31){
const err177 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf",keyword:"oneOf",params:{passingSchemas: passing2},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err177];
}
else {
vErrors.push(err177);
}
errors++;
}
else {
errors = _errs187;
if(vErrors !== null){
if(_errs187){
vErrors.length = _errs187;
}
else {
vErrors = null;
}
}
}
var valid29 = _errs185 === errors;
}
else {
var valid29 = true;
}
if(valid29){
if(data.operation !== undefined){
let data67 = data.operation;
const _errs221 = errors;
if(typeof data67 !== "string"){
const err178 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/17/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err178];
}
else {
vErrors.push(err178);
}
errors++;
}
if("dock" !== data67){
const err179 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/17/properties/operation/const",keyword:"const",params:{allowedValue: "dock"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err179];
}
else {
vErrors.push(err179);
}
errors++;
}
var valid29 = _errs221 === errors;
}
else {
var valid29 = true;
}
}
}
}
}
else {
const err180 = {instancePath,schemaPath:"#/oneOf/17/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err180];
}
else {
vErrors.push(err180);
}
errors++;
}
}
var _valid0 = _errs182 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 17];
}
else {
if(_valid0){
valid0 = true;
passing0 = 17;
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
if(!valid0){
const err181 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err181];
}
else {
vErrors.push(err181);
}
errors++;
validate58.errors = vErrors;
return false;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate58.errors = vErrors;
return errors === 0;
}


function validate57(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((data.expectedVersion === undefined) && (missing0 = "expectedVersion")) || ((data.action === undefined) && (missing0 = "action"))){
validate57.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((key0 === "action") || (key0 === "expectedVersion"))){
validate57.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.action !== undefined){
const _errs2 = errors;
if(!(validate58(data.action, {instancePath:instancePath+"/action",parentData:data,parentDataProperty:"action",rootData}))){
vErrors = vErrors === null ? validate58.errors : vErrors.concat(validate58.errors);
errors = vErrors.length;
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.expectedVersion !== undefined){
const _errs3 = errors;
if(typeof data.expectedVersion !== "string"){
validate57.errors = [{instancePath:instancePath+"/expectedVersion",schemaPath:"#/properties/expectedVersion/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs3 === errors;
}
else {
var valid0 = true;
}
}
}
}
}
else {
validate57.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate57.errors = vErrors;
return errors === 0;
}
