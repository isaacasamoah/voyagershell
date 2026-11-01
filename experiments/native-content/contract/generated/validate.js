"use strict";
export const request = validate10;
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

export const response = validate11;
const schema16 = {"$schema":"http://json-schema.org/draft-07/schema#","definitions":{"Notes":{"additionalProperties":false,"properties":{"text":{"type":"string"},"title":{"type":"string"}},"required":["title","text"],"type":"object"},"Snapshot":{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"data":{"$ref":"#/definitions/Notes"},"revision":{"type":"string"},"warning":{"type":["string","null"]}},"required":["contentId","revision","data"],"type":"object"},"Version":{"enum":["1"],"type":"string"}},"oneOf":[{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"requestId":{"type":"string"},"schemaDeclared":{"type":"boolean"},"stateSchema":true,"status":{"const":"described","type":"string"},"version":{"$ref":"#/definitions/Version"}},"required":["status","version","requestId","contentId","schemaDeclared"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"requestId":{"type":"string"},"snapshot":{"$ref":"#/definitions/Snapshot"},"status":{"const":"snapshot","type":"string"},"version":{"$ref":"#/definitions/Version"}},"required":["status","version","requestId","contentId","snapshot"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"requestId":{"type":"string"},"snapshot":{"$ref":"#/definitions/Snapshot"},"status":{"const":"applied","type":"string"},"version":{"$ref":"#/definitions/Version"}},"required":["status","version","requestId","contentId","snapshot"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"expectedRevision":{"type":["string","null"]},"message":{"type":"string"},"requestId":{"type":"string"},"status":{"const":"rejected","type":"string"},"version":{"$ref":"#/definitions/Version"}},"required":["status","version","requestId","contentId","message"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"expectedRevision":{"type":"string"},"message":{"type":"string"},"requestId":{"type":"string"},"status":{"const":"uncertain","type":"string"},"version":{"$ref":"#/definitions/Version"}},"required":["status","version","requestId","contentId","expectedRevision","message"],"type":"object"}],"title":"Response"};
const schema17 = {"enum":["1"],"type":"string"};
const schema18 = {"additionalProperties":false,"properties":{"contentId":{"type":"string"},"data":{"$ref":"#/definitions/Notes"},"revision":{"type":"string"},"warning":{"type":["string","null"]}},"required":["contentId","revision","data"],"type":"object"};
const schema19 = {"additionalProperties":false,"properties":{"text":{"type":"string"},"title":{"type":"string"}},"required":["title","text"],"type":"object"};

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
validate12.errors = [{instancePath:instancePath+"/warning",schemaPath:"#/properties/warning/type",keyword:"type",params:{type: schema18.properties.warning.type},message:"must be string,null"}];
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
if((((((data.status === undefined) && (missing0 = "status")) || ((data.version === undefined) && (missing0 = "version"))) || ((data.requestId === undefined) && (missing0 = "requestId"))) || ((data.contentId === undefined) && (missing0 = "contentId"))) || ((data.schemaDeclared === undefined) && (missing0 = "schemaDeclared"))){
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
if(!((((((key0 === "contentId") || (key0 === "requestId")) || (key0 === "schemaDeclared")) || (key0 === "stateSchema")) || (key0 === "status")) || (key0 === "version"))){
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
if(data.requestId !== undefined){
const _errs6 = errors;
if(typeof data.requestId !== "string"){
const err3 = {instancePath:instancePath+"/requestId",schemaPath:"#/oneOf/0/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
if(data.schemaDeclared !== undefined){
const _errs8 = errors;
if(typeof data.schemaDeclared !== "boolean"){
const err4 = {instancePath:instancePath+"/schemaDeclared",schemaPath:"#/oneOf/0/properties/schemaDeclared/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
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
if(data.status !== undefined){
let data3 = data.status;
const _errs10 = errors;
if(typeof data3 !== "string"){
const err5 = {instancePath:instancePath+"/status",schemaPath:"#/oneOf/0/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if("described" !== data3){
const err6 = {instancePath:instancePath+"/status",schemaPath:"#/oneOf/0/properties/status/const",keyword:"const",params:{allowedValue: "described"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
var valid1 = _errs10 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.version !== undefined){
let data4 = data.version;
const _errs12 = errors;
if(typeof data4 !== "string"){
const err7 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(!(data4 === "1")){
const err8 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/enum",keyword:"enum",params:{allowedValues: schema17.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
var valid1 = _errs12 === errors;
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
else {
const err9 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
}
const _errs15 = errors;
if(errors === _errs15){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing1;
if((((((data.status === undefined) && (missing1 = "status")) || ((data.version === undefined) && (missing1 = "version"))) || ((data.requestId === undefined) && (missing1 = "requestId"))) || ((data.contentId === undefined) && (missing1 = "contentId"))) || ((data.snapshot === undefined) && (missing1 = "snapshot"))){
const err10 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
else {
const _errs17 = errors;
for(const key1 in data){
if(!(((((key1 === "contentId") || (key1 === "requestId")) || (key1 === "snapshot")) || (key1 === "status")) || (key1 === "version"))){
const err11 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
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
if(_errs17 === errors){
if(data.contentId !== undefined){
const _errs18 = errors;
if(typeof data.contentId !== "string"){
const err12 = {instancePath:instancePath+"/contentId",schemaPath:"#/oneOf/1/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
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
const err13 = {instancePath:instancePath+"/requestId",schemaPath:"#/oneOf/1/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
var valid3 = _errs20 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data.snapshot !== undefined){
const _errs22 = errors;
if(!(validate12(data.snapshot, {instancePath:instancePath+"/snapshot",parentData:data,parentDataProperty:"snapshot",rootData}))){
vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
errors = vErrors.length;
}
var valid3 = _errs22 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data.status !== undefined){
let data8 = data.status;
const _errs23 = errors;
if(typeof data8 !== "string"){
const err14 = {instancePath:instancePath+"/status",schemaPath:"#/oneOf/1/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if("snapshot" !== data8){
const err15 = {instancePath:instancePath+"/status",schemaPath:"#/oneOf/1/properties/status/const",keyword:"const",params:{allowedValue: "snapshot"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
var valid3 = _errs23 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data.version !== undefined){
let data9 = data.version;
const _errs25 = errors;
if(typeof data9 !== "string"){
const err16 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(!(data9 === "1")){
const err17 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/enum",keyword:"enum",params:{allowedValues: schema17.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
var valid3 = _errs25 === errors;
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
const err18 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
var _valid0 = _errs15 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
}
const _errs28 = errors;
if(errors === _errs28){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing2;
if((((((data.status === undefined) && (missing2 = "status")) || ((data.version === undefined) && (missing2 = "version"))) || ((data.requestId === undefined) && (missing2 = "requestId"))) || ((data.contentId === undefined) && (missing2 = "contentId"))) || ((data.snapshot === undefined) && (missing2 = "snapshot"))){
const err19 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"};
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
if(!(((((key2 === "contentId") || (key2 === "requestId")) || (key2 === "snapshot")) || (key2 === "status")) || (key2 === "version"))){
const err20 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
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
if(data.contentId !== undefined){
const _errs31 = errors;
if(typeof data.contentId !== "string"){
const err21 = {instancePath:instancePath+"/contentId",schemaPath:"#/oneOf/2/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
var valid5 = _errs31 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data.requestId !== undefined){
const _errs33 = errors;
if(typeof data.requestId !== "string"){
const err22 = {instancePath:instancePath+"/requestId",schemaPath:"#/oneOf/2/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
var valid5 = _errs33 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data.snapshot !== undefined){
const _errs35 = errors;
if(!(validate12(data.snapshot, {instancePath:instancePath+"/snapshot",parentData:data,parentDataProperty:"snapshot",rootData}))){
vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
errors = vErrors.length;
}
var valid5 = _errs35 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data.status !== undefined){
let data13 = data.status;
const _errs36 = errors;
if(typeof data13 !== "string"){
const err23 = {instancePath:instancePath+"/status",schemaPath:"#/oneOf/2/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if("applied" !== data13){
const err24 = {instancePath:instancePath+"/status",schemaPath:"#/oneOf/2/properties/status/const",keyword:"const",params:{allowedValue: "applied"},message:"must be equal to constant"};
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
if(data.version !== undefined){
let data14 = data.version;
const _errs38 = errors;
if(typeof data14 !== "string"){
const err25 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(!(data14 === "1")){
const err26 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/enum",keyword:"enum",params:{allowedValues: schema17.enum},message:"must be equal to one of the allowed values"};
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
}
}
}
}
}
}
}
else {
const err27 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
var _valid0 = _errs28 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
}
const _errs41 = errors;
if(errors === _errs41){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing3;
if((((((data.status === undefined) && (missing3 = "status")) || ((data.version === undefined) && (missing3 = "version"))) || ((data.requestId === undefined) && (missing3 = "requestId"))) || ((data.contentId === undefined) && (missing3 = "contentId"))) || ((data.message === undefined) && (missing3 = "message"))){
const err28 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: missing3},message:"must have required property '"+missing3+"'"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
else {
const _errs43 = errors;
for(const key3 in data){
if(!((((((key3 === "contentId") || (key3 === "expectedRevision")) || (key3 === "message")) || (key3 === "requestId")) || (key3 === "status")) || (key3 === "version"))){
const err29 = {instancePath,schemaPath:"#/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
break;
}
}
if(_errs43 === errors){
if(data.contentId !== undefined){
const _errs44 = errors;
if(typeof data.contentId !== "string"){
const err30 = {instancePath:instancePath+"/contentId",schemaPath:"#/oneOf/3/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
var valid7 = _errs44 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data.expectedRevision !== undefined){
let data16 = data.expectedRevision;
const _errs46 = errors;
if((typeof data16 !== "string") && (data16 !== null)){
const err31 = {instancePath:instancePath+"/expectedRevision",schemaPath:"#/oneOf/3/properties/expectedRevision/type",keyword:"type",params:{type: schema16.oneOf[3].properties.expectedRevision.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
var valid7 = _errs46 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data.message !== undefined){
const _errs48 = errors;
if(typeof data.message !== "string"){
const err32 = {instancePath:instancePath+"/message",schemaPath:"#/oneOf/3/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
var valid7 = _errs48 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data.requestId !== undefined){
const _errs50 = errors;
if(typeof data.requestId !== "string"){
const err33 = {instancePath:instancePath+"/requestId",schemaPath:"#/oneOf/3/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
var valid7 = _errs50 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data.status !== undefined){
let data19 = data.status;
const _errs52 = errors;
if(typeof data19 !== "string"){
const err34 = {instancePath:instancePath+"/status",schemaPath:"#/oneOf/3/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
if("rejected" !== data19){
const err35 = {instancePath:instancePath+"/status",schemaPath:"#/oneOf/3/properties/status/const",keyword:"const",params:{allowedValue: "rejected"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
var valid7 = _errs52 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data.version !== undefined){
let data20 = data.version;
const _errs54 = errors;
if(typeof data20 !== "string"){
const err36 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
if(!(data20 === "1")){
const err37 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/enum",keyword:"enum",params:{allowedValues: schema17.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
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
}
}
else {
const err38 = {instancePath,schemaPath:"#/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
var _valid0 = _errs41 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid0 = true;
passing0 = 3;
}
const _errs57 = errors;
if(errors === _errs57){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing4;
if(((((((data.status === undefined) && (missing4 = "status")) || ((data.version === undefined) && (missing4 = "version"))) || ((data.requestId === undefined) && (missing4 = "requestId"))) || ((data.contentId === undefined) && (missing4 = "contentId"))) || ((data.expectedRevision === undefined) && (missing4 = "expectedRevision"))) || ((data.message === undefined) && (missing4 = "message"))){
const err39 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: missing4},message:"must have required property '"+missing4+"'"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
else {
const _errs59 = errors;
for(const key4 in data){
if(!((((((key4 === "contentId") || (key4 === "expectedRevision")) || (key4 === "message")) || (key4 === "requestId")) || (key4 === "status")) || (key4 === "version"))){
const err40 = {instancePath,schemaPath:"#/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
break;
}
}
if(_errs59 === errors){
if(data.contentId !== undefined){
const _errs60 = errors;
if(typeof data.contentId !== "string"){
const err41 = {instancePath:instancePath+"/contentId",schemaPath:"#/oneOf/4/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
var valid9 = _errs60 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data.expectedRevision !== undefined){
const _errs62 = errors;
if(typeof data.expectedRevision !== "string"){
const err42 = {instancePath:instancePath+"/expectedRevision",schemaPath:"#/oneOf/4/properties/expectedRevision/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
if(data.message !== undefined){
const _errs64 = errors;
if(typeof data.message !== "string"){
const err43 = {instancePath:instancePath+"/message",schemaPath:"#/oneOf/4/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
if(data.requestId !== undefined){
const _errs66 = errors;
if(typeof data.requestId !== "string"){
const err44 = {instancePath:instancePath+"/requestId",schemaPath:"#/oneOf/4/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
if(data.status !== undefined){
let data25 = data.status;
const _errs68 = errors;
if(typeof data25 !== "string"){
const err45 = {instancePath:instancePath+"/status",schemaPath:"#/oneOf/4/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
if("uncertain" !== data25){
const err46 = {instancePath:instancePath+"/status",schemaPath:"#/oneOf/4/properties/status/const",keyword:"const",params:{allowedValue: "uncertain"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
var valid9 = _errs68 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data.version !== undefined){
let data26 = data.version;
const _errs70 = errors;
if(typeof data26 !== "string"){
const err47 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
if(!(data26 === "1")){
const err48 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/enum",keyword:"enum",params:{allowedValues: schema17.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
var valid9 = _errs70 === errors;
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
const err49 = {instancePath,schemaPath:"#/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
var _valid0 = _errs57 === errors;
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
const err50 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
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

export const notes = validate15;
const schema24 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"properties":{"text":{"type":"string"},"title":{"type":"string"}},"required":["title","text"],"title":"Notes","type":"object"};

function validate15(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((data.title === undefined) && (missing0 = "title")) || ((data.text === undefined) && (missing0 = "text"))){
validate15.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((key0 === "text") || (key0 === "title"))){
validate15.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.text !== undefined){
const _errs2 = errors;
if(typeof data.text !== "string"){
validate15.errors = [{instancePath:instancePath+"/text",schemaPath:"#/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate15.errors = [{instancePath:instancePath+"/title",schemaPath:"#/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate15.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate15.errors = vErrors;
return errors === 0;
}
