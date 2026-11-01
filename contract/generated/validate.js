"use strict";
export const conversationReply = validate10;
const schema11 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"definitions":{"Delivery":{"enum":["accepted","rejected","unconfirmed"],"type":"string"}},"properties":{"delivery":{"$ref":"#/definitions/Delivery"},"error":{"type":["string","null"]},"requestId":{"type":"string"}},"required":["requestId","delivery"],"title":"Reply","type":"object"};
const schema12 = {"enum":["accepted","rejected","unconfirmed"],"type":"string"};

function validate10(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((data.requestId === undefined) && (missing0 = "requestId")) || ((data.delivery === undefined) && (missing0 = "delivery"))){
validate10.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(((key0 === "delivery") || (key0 === "error")) || (key0 === "requestId"))){
validate10.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.delivery !== undefined){
let data0 = data.delivery;
const _errs2 = errors;
if(typeof data0 !== "string"){
validate10.errors = [{instancePath:instancePath+"/delivery",schemaPath:"#/definitions/Delivery/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!(((data0 === "accepted") || (data0 === "rejected")) || (data0 === "unconfirmed"))){
validate10.errors = [{instancePath:instancePath+"/delivery",schemaPath:"#/definitions/Delivery/enum",keyword:"enum",params:{allowedValues: schema12.enum},message:"must be equal to one of the allowed values"}];
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
validate10.errors = [{instancePath:instancePath+"/error",schemaPath:"#/properties/error/type",keyword:"type",params:{type: schema11.properties.error.type},message:"must be string,null"}];
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
validate10.errors = [{instancePath:instancePath+"/requestId",schemaPath:"#/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate10.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate10.errors = vErrors;
return errors === 0;
}

export const conversationRequest = validate11;
const schema13 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"definitions":{"Action":{"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"send","type":"string"},"text":{"type":"string"}},"required":["operation","text"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"interrupt","type":"string"}},"required":["operation"],"type":"object"}]}},"properties":{"action":{"$ref":"#/definitions/Action"},"requestId":{"type":"string"}},"required":["requestId","action"],"title":"Request","type":"object"};
const schema14 = {"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"send","type":"string"},"text":{"type":"string"}},"required":["operation","text"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"interrupt","type":"string"}},"required":["operation"],"type":"object"}]};

function validate11(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((data.requestId === undefined) && (missing0 = "requestId")) || ((data.action === undefined) && (missing0 = "action"))){
validate11.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((key0 === "action") || (key0 === "requestId"))){
validate11.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
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
validate11.errors = vErrors;
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
validate11.errors = [{instancePath:instancePath+"/requestId",schemaPath:"#/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate11.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate11.errors = vErrors;
return errors === 0;
}

export const conversationSnapshot = validate12;
const schema15 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"definitions":{"Context":{"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"workspace","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]},"Message":{"additionalProperties":false,"properties":{"context":{"anyOf":[{"$ref":"#/definitions/Context"},{"type":"null"}]},"id":{"type":"string"},"requestId":{"type":"string"},"role":{"$ref":"#/definitions/Role"},"text":{"type":"string"}},"required":["id","requestId","role","text"],"type":"object"},"Phase":{"enum":["idle","starting","working","completed","interrupted","failed","unconfirmed"],"type":"string"},"Role":{"enum":["user","assistant"],"type":"string"}},"properties":{"error":{"type":["string","null"]},"limited":{"type":"boolean"},"messages":{"items":{"$ref":"#/definitions/Message"},"type":"array"},"model":{"type":["string","null"]},"omitted":{"type":"string"},"phase":{"$ref":"#/definitions/Phase"},"thread":{"type":["string","null"]},"turn":{"type":["string","null"]},"version":{"type":"string"}},"required":["version","phase","messages","limited","omitted"],"title":"Snapshot","type":"object"};
const schema19 = {"enum":["idle","starting","working","completed","interrupted","failed","unconfirmed"],"type":"string"};
const func2 = Object.prototype.hasOwnProperty;
const schema16 = {"additionalProperties":false,"properties":{"context":{"anyOf":[{"$ref":"#/definitions/Context"},{"type":"null"}]},"id":{"type":"string"},"requestId":{"type":"string"},"role":{"$ref":"#/definitions/Role"},"text":{"type":"string"}},"required":["id","requestId","role","text"],"type":"object"};
const schema17 = {"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"workspace","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]};
const schema18 = {"enum":["user","assistant"],"type":"string"};

function validate13(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((((data.id === undefined) && (missing0 = "id")) || ((data.requestId === undefined) && (missing0 = "requestId"))) || ((data.role === undefined) && (missing0 = "role"))) || ((data.text === undefined) && (missing0 = "text"))){
validate13.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(((((key0 === "context") || (key0 === "id")) || (key0 === "requestId")) || (key0 === "role")) || (key0 === "text"))){
validate13.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
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
const _errs6 = errors;
let valid3 = false;
let passing0 = null;
const _errs7 = errors;
if(errors === _errs7){
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
let missing1;
if((data0.kind === undefined) && (missing1 = "kind")){
const err0 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/0/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
else {
const _errs9 = errors;
for(const key1 in data0){
if(!(key1 === "kind")){
const err1 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
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
if(_errs9 === errors){
if(data0.kind !== undefined){
let data1 = data0.kind;
if(typeof data1 !== "string"){
const err2 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if("workspace" !== data1){
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
var _valid1 = _errs7 === errors;
if(_valid1){
valid3 = true;
passing0 = 0;
}
const _errs12 = errors;
if(errors === _errs12){
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
let missing2;
if(((data0.kind === undefined) && (missing2 = "kind")) || ((data0.id === undefined) && (missing2 = "id"))){
const err5 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/1/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
else {
const _errs14 = errors;
for(const key2 in data0){
if(!((key2 === "id") || (key2 === "kind"))){
const err6 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
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
if(_errs14 === errors){
if(data0.id !== undefined){
const _errs15 = errors;
if(typeof data0.id !== "string"){
const err7 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/1/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
var valid5 = _errs15 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data0.kind !== undefined){
let data3 = data0.kind;
const _errs17 = errors;
if(typeof data3 !== "string"){
const err8 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if("voyage" !== data3){
const err9 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
var valid5 = _errs17 === errors;
}
else {
var valid5 = true;
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
var _valid1 = _errs12 === errors;
if(_valid1 && valid3){
valid3 = false;
passing0 = [passing0, 1];
}
else {
if(_valid1){
valid3 = true;
passing0 = 1;
}
const _errs19 = errors;
if(errors === _errs19){
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
let missing3;
if(((data0.kind === undefined) && (missing3 = "kind")) || ((data0.id === undefined) && (missing3 = "id"))){
const err11 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/2/required",keyword:"required",params:{missingProperty: missing3},message:"must have required property '"+missing3+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
else {
const _errs21 = errors;
for(const key3 in data0){
if(!((key3 === "id") || (key3 === "kind"))){
const err12 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
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
if(_errs21 === errors){
if(data0.id !== undefined){
const _errs22 = errors;
if(typeof data0.id !== "string"){
const err13 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/2/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
var valid6 = _errs22 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data0.kind !== undefined){
let data5 = data0.kind;
const _errs24 = errors;
if(typeof data5 !== "string"){
const err14 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if("fleet" !== data5){
const err15 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
var valid6 = _errs24 === errors;
}
else {
var valid6 = true;
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
var _valid1 = _errs19 === errors;
if(_valid1 && valid3){
valid3 = false;
passing0 = [passing0, 2];
}
else {
if(_valid1){
valid3 = true;
passing0 = 2;
}
const _errs26 = errors;
if(errors === _errs26){
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
let missing4;
if(((data0.kind === undefined) && (missing4 = "kind")) || ((data0.id === undefined) && (missing4 = "id"))){
const err17 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/3/required",keyword:"required",params:{missingProperty: missing4},message:"must have required property '"+missing4+"'"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
else {
const _errs28 = errors;
for(const key4 in data0){
if(!((key4 === "id") || (key4 === "kind"))){
const err18 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
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
if(_errs28 === errors){
if(data0.id !== undefined){
const _errs29 = errors;
if(typeof data0.id !== "string"){
const err19 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/3/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
var valid7 = _errs29 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data0.kind !== undefined){
let data7 = data0.kind;
const _errs31 = errors;
if(typeof data7 !== "string"){
const err20 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/3/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if("vessel" !== data7){
const err21 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/3/properties/kind/const",keyword:"const",params:{allowedValue: "vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
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
var _valid1 = _errs26 === errors;
if(_valid1 && valid3){
valid3 = false;
passing0 = [passing0, 3];
}
else {
if(_valid1){
valid3 = true;
passing0 = 3;
}
const _errs33 = errors;
if(errors === _errs33){
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
let missing5;
if(((data0.kind === undefined) && (missing5 = "kind")) || ((data0.id === undefined) && (missing5 = "id"))){
const err23 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/4/required",keyword:"required",params:{missingProperty: missing5},message:"must have required property '"+missing5+"'"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
else {
const _errs35 = errors;
for(const key5 in data0){
if(!((key5 === "id") || (key5 === "kind"))){
const err24 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
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
if(_errs35 === errors){
if(data0.id !== undefined){
const _errs36 = errors;
if(typeof data0.id !== "string"){
const err25 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/4/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
var valid8 = _errs36 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data0.kind !== undefined){
let data9 = data0.kind;
const _errs38 = errors;
if(typeof data9 !== "string"){
const err26 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/4/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if("portal" !== data9){
const err27 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/4/properties/kind/const",keyword:"const",params:{allowedValue: "portal"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
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
var _valid1 = _errs33 === errors;
if(_valid1 && valid3){
valid3 = false;
passing0 = [passing0, 4];
}
else {
if(_valid1){
valid3 = true;
passing0 = 4;
}
}
}
}
}
if(!valid3){
const err29 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
else {
errors = _errs6;
if(vErrors !== null){
if(_errs6){
vErrors.length = _errs6;
}
else {
vErrors = null;
}
}
}
var _valid0 = _errs4 === errors;
valid1 = valid1 || _valid0;
if(!valid1){
const _errs40 = errors;
if(data0 !== null){
const err30 = {instancePath:instancePath+"/context",schemaPath:"#/properties/context/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
var _valid0 = _errs40 === errors;
valid1 = valid1 || _valid0;
}
if(!valid1){
const err31 = {instancePath:instancePath+"/context",schemaPath:"#/properties/context/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
validate13.errors = vErrors;
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
const _errs42 = errors;
if(typeof data.id !== "string"){
validate13.errors = [{instancePath:instancePath+"/id",schemaPath:"#/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs42 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.requestId !== undefined){
const _errs44 = errors;
if(typeof data.requestId !== "string"){
validate13.errors = [{instancePath:instancePath+"/requestId",schemaPath:"#/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs44 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.role !== undefined){
let data12 = data.role;
const _errs46 = errors;
if(typeof data12 !== "string"){
validate13.errors = [{instancePath:instancePath+"/role",schemaPath:"#/definitions/Role/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!((data12 === "user") || (data12 === "assistant"))){
validate13.errors = [{instancePath:instancePath+"/role",schemaPath:"#/definitions/Role/enum",keyword:"enum",params:{allowedValues: schema18.enum},message:"must be equal to one of the allowed values"}];
return false;
}
var valid0 = _errs46 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.text !== undefined){
const _errs49 = errors;
if(typeof data.text !== "string"){
validate13.errors = [{instancePath:instancePath+"/text",schemaPath:"#/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs49 === errors;
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
else {
validate13.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate13.errors = vErrors;
return errors === 0;
}


function validate12(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((((((data.version === undefined) && (missing0 = "version")) || ((data.phase === undefined) && (missing0 = "phase"))) || ((data.messages === undefined) && (missing0 = "messages"))) || ((data.limited === undefined) && (missing0 = "limited"))) || ((data.omitted === undefined) && (missing0 = "omitted"))){
validate12.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(func2.call(schema15.properties, key0))){
validate12.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.error !== undefined){
let data0 = data.error;
const _errs2 = errors;
if((typeof data0 !== "string") && (data0 !== null)){
validate12.errors = [{instancePath:instancePath+"/error",schemaPath:"#/properties/error/type",keyword:"type",params:{type: schema15.properties.error.type},message:"must be string,null"}];
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
validate12.errors = [{instancePath:instancePath+"/limited",schemaPath:"#/properties/limited/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"}];
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
if(!(validate13(data2[i0], {instancePath:instancePath+"/messages/" + i0,parentData:data2,parentDataProperty:i0,rootData}))){
vErrors = vErrors === null ? validate13.errors : vErrors.concat(validate13.errors);
errors = vErrors.length;
}
var valid1 = _errs8 === errors;
if(!valid1){
break;
}
}
}
else {
validate12.errors = [{instancePath:instancePath+"/messages",schemaPath:"#/properties/messages/type",keyword:"type",params:{type: "array"},message:"must be array"}];
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
validate12.errors = [{instancePath:instancePath+"/model",schemaPath:"#/properties/model/type",keyword:"type",params:{type: schema15.properties.model.type},message:"must be string,null"}];
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
validate12.errors = [{instancePath:instancePath+"/omitted",schemaPath:"#/properties/omitted/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate12.errors = [{instancePath:instancePath+"/phase",schemaPath:"#/definitions/Phase/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!(((((((data6 === "idle") || (data6 === "starting")) || (data6 === "working")) || (data6 === "completed")) || (data6 === "interrupted")) || (data6 === "failed")) || (data6 === "unconfirmed"))){
validate12.errors = [{instancePath:instancePath+"/phase",schemaPath:"#/definitions/Phase/enum",keyword:"enum",params:{allowedValues: schema19.enum},message:"must be equal to one of the allowed values"}];
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
validate12.errors = [{instancePath:instancePath+"/thread",schemaPath:"#/properties/thread/type",keyword:"type",params:{type: schema15.properties.thread.type},message:"must be string,null"}];
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
validate12.errors = [{instancePath:instancePath+"/turn",schemaPath:"#/properties/turn/type",keyword:"type",params:{type: schema15.properties.turn.type},message:"must be string,null"}];
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
validate12.errors = [{instancePath:instancePath+"/version",schemaPath:"#/properties/version/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate12.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate12.errors = vErrors;
return errors === 0;
}

export const request = validate15;
const schema20 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"definitions":{"Action":{"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"inspect","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"cwd":{"type":"string"},"name":{"type":"string"},"operation":{"const":"create-voyage","type":"string"}},"required":["operation","name","cwd"],"type":"object"},{"additionalProperties":false,"properties":{"name":{"type":"string"},"operation":{"const":"create-fleet","type":"string"},"voyage":{"type":"string"}},"required":["operation","voyage","name"],"type":"object"},{"additionalProperties":false,"properties":{"after":{"type":"string"},"axis":{"$ref":"#/definitions/Axis"},"fleet":{"type":"string"},"operation":{"const":"split","type":"string"}},"required":["operation","fleet","after","axis"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"select-voyage","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"select-fleet","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"context":{"$ref":"#/definitions/Context"},"operation":{"const":"dock","type":"string"}},"required":["operation","context"],"type":"object"}]},"Axis":{"enum":["horizontal","vertical"],"type":"string"},"Context":{"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"workspace","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]}},"properties":{"action":{"$ref":"#/definitions/Action"},"expectedVersion":{"type":"string"},"requestId":{"type":"string"}},"required":["requestId","expectedVersion","action"],"title":"Request","type":"object"};
const schema21 = {"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"inspect","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"cwd":{"type":"string"},"name":{"type":"string"},"operation":{"const":"create-voyage","type":"string"}},"required":["operation","name","cwd"],"type":"object"},{"additionalProperties":false,"properties":{"name":{"type":"string"},"operation":{"const":"create-fleet","type":"string"},"voyage":{"type":"string"}},"required":["operation","voyage","name"],"type":"object"},{"additionalProperties":false,"properties":{"after":{"type":"string"},"axis":{"$ref":"#/definitions/Axis"},"fleet":{"type":"string"},"operation":{"const":"split","type":"string"}},"required":["operation","fleet","after","axis"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"select-voyage","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"select-fleet","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"context":{"$ref":"#/definitions/Context"},"operation":{"const":"dock","type":"string"}},"required":["operation","context"],"type":"object"}]};
const schema22 = {"enum":["horizontal","vertical"],"type":"string"};
const schema23 = {"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"workspace","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]};

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
if((((data.operation === undefined) && (missing1 = "operation")) || ((data.name === undefined) && (missing1 = "name"))) || ((data.cwd === undefined) && (missing1 = "cwd"))){
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
if(!(((key1 === "cwd") || (key1 === "name")) || (key1 === "operation"))){
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
if(data.cwd !== undefined){
const _errs9 = errors;
if(typeof data.cwd !== "string"){
const err7 = {instancePath:instancePath+"/cwd",schemaPath:"#/oneOf/1/properties/cwd/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
var valid2 = _errs9 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data.name !== undefined){
const _errs11 = errors;
if(typeof data.name !== "string"){
const err8 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/1/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
if("create-voyage" !== data3){
const err10 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/1/properties/operation/const",keyword:"const",params:{allowedValue: "create-voyage"},message:"must be equal to constant"};
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
const _errs15 = errors;
if(errors === _errs15){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing2;
if((((data.operation === undefined) && (missing2 = "operation")) || ((data.voyage === undefined) && (missing2 = "voyage"))) || ((data.name === undefined) && (missing2 = "name"))){
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
if(!(((key2 === "name") || (key2 === "operation")) || (key2 === "voyage"))){
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
if(data.name !== undefined){
const _errs18 = errors;
if(typeof data.name !== "string"){
const err14 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/2/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
if(data.operation !== undefined){
let data5 = data.operation;
const _errs20 = errors;
if(typeof data5 !== "string"){
const err15 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/2/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if("create-fleet" !== data5){
const err16 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/2/properties/operation/const",keyword:"const",params:{allowedValue: "create-fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
var valid3 = _errs20 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data.voyage !== undefined){
const _errs22 = errors;
if(typeof data.voyage !== "string"){
const err17 = {instancePath:instancePath+"/voyage",schemaPath:"#/oneOf/2/properties/voyage/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
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
else {
const err18 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
}
const _errs24 = errors;
if(errors === _errs24){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing3;
if(((((data.operation === undefined) && (missing3 = "operation")) || ((data.fleet === undefined) && (missing3 = "fleet"))) || ((data.after === undefined) && (missing3 = "after"))) || ((data.axis === undefined) && (missing3 = "axis"))){
const err19 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: missing3},message:"must have required property '"+missing3+"'"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
else {
const _errs26 = errors;
for(const key3 in data){
if(!((((key3 === "after") || (key3 === "axis")) || (key3 === "fleet")) || (key3 === "operation"))){
const err20 = {instancePath,schemaPath:"#/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
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
if(_errs26 === errors){
if(data.after !== undefined){
const _errs27 = errors;
if(typeof data.after !== "string"){
const err21 = {instancePath:instancePath+"/after",schemaPath:"#/oneOf/3/properties/after/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
var valid4 = _errs27 === errors;
}
else {
var valid4 = true;
}
if(valid4){
if(data.axis !== undefined){
let data8 = data.axis;
const _errs29 = errors;
if(typeof data8 !== "string"){
const err22 = {instancePath:instancePath+"/axis",schemaPath:"#/definitions/Axis/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(!((data8 === "horizontal") || (data8 === "vertical"))){
const err23 = {instancePath:instancePath+"/axis",schemaPath:"#/definitions/Axis/enum",keyword:"enum",params:{allowedValues: schema22.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
var valid4 = _errs29 === errors;
}
else {
var valid4 = true;
}
if(valid4){
if(data.fleet !== undefined){
const _errs32 = errors;
if(typeof data.fleet !== "string"){
const err24 = {instancePath:instancePath+"/fleet",schemaPath:"#/oneOf/3/properties/fleet/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
var valid4 = _errs32 === errors;
}
else {
var valid4 = true;
}
if(valid4){
if(data.operation !== undefined){
let data10 = data.operation;
const _errs34 = errors;
if(typeof data10 !== "string"){
const err25 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/3/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if("split" !== data10){
const err26 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/3/properties/operation/const",keyword:"const",params:{allowedValue: "split"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
var valid4 = _errs34 === errors;
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
const err27 = {instancePath,schemaPath:"#/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
var _valid0 = _errs24 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid0 = true;
passing0 = 3;
}
const _errs36 = errors;
if(errors === _errs36){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing4;
if(((data.operation === undefined) && (missing4 = "operation")) || ((data.id === undefined) && (missing4 = "id"))){
const err28 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: missing4},message:"must have required property '"+missing4+"'"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
else {
const _errs38 = errors;
for(const key4 in data){
if(!((key4 === "id") || (key4 === "operation"))){
const err29 = {instancePath,schemaPath:"#/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
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
if(_errs38 === errors){
if(data.id !== undefined){
const _errs39 = errors;
if(typeof data.id !== "string"){
const err30 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/4/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
if(data.operation !== undefined){
let data12 = data.operation;
const _errs41 = errors;
if(typeof data12 !== "string"){
const err31 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/4/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
if("select-voyage" !== data12){
const err32 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/4/properties/operation/const",keyword:"const",params:{allowedValue: "select-voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
var valid6 = _errs41 === errors;
}
else {
var valid6 = true;
}
}
}
}
}
else {
const err33 = {instancePath,schemaPath:"#/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
var _valid0 = _errs36 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 4];
}
else {
if(_valid0){
valid0 = true;
passing0 = 4;
}
const _errs43 = errors;
if(errors === _errs43){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing5;
if(((data.operation === undefined) && (missing5 = "operation")) || ((data.id === undefined) && (missing5 = "id"))){
const err34 = {instancePath,schemaPath:"#/oneOf/5/required",keyword:"required",params:{missingProperty: missing5},message:"must have required property '"+missing5+"'"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
else {
const _errs45 = errors;
for(const key5 in data){
if(!((key5 === "id") || (key5 === "operation"))){
const err35 = {instancePath,schemaPath:"#/oneOf/5/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
break;
}
}
if(_errs45 === errors){
if(data.id !== undefined){
const _errs46 = errors;
if(typeof data.id !== "string"){
const err36 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/5/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
var valid7 = _errs46 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data.operation !== undefined){
let data14 = data.operation;
const _errs48 = errors;
if(typeof data14 !== "string"){
const err37 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/5/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
if("select-fleet" !== data14){
const err38 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/5/properties/operation/const",keyword:"const",params:{allowedValue: "select-fleet"},message:"must be equal to constant"};
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
}
}
}
}
else {
const err39 = {instancePath,schemaPath:"#/oneOf/5/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
var _valid0 = _errs43 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 5];
}
else {
if(_valid0){
valid0 = true;
passing0 = 5;
}
const _errs50 = errors;
if(errors === _errs50){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing6;
if(((data.operation === undefined) && (missing6 = "operation")) || ((data.context === undefined) && (missing6 = "context"))){
const err40 = {instancePath,schemaPath:"#/oneOf/6/required",keyword:"required",params:{missingProperty: missing6},message:"must have required property '"+missing6+"'"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
else {
const _errs52 = errors;
for(const key6 in data){
if(!((key6 === "context") || (key6 === "operation"))){
const err41 = {instancePath,schemaPath:"#/oneOf/6/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
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
if(_errs52 === errors){
if(data.context !== undefined){
let data15 = data.context;
const _errs53 = errors;
const _errs55 = errors;
let valid10 = false;
let passing1 = null;
const _errs56 = errors;
if(errors === _errs56){
if(data15 && typeof data15 == "object" && !Array.isArray(data15)){
let missing7;
if((data15.kind === undefined) && (missing7 = "kind")){
const err42 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/0/required",keyword:"required",params:{missingProperty: missing7},message:"must have required property '"+missing7+"'"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
else {
const _errs58 = errors;
for(const key7 in data15){
if(!(key7 === "kind")){
const err43 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key7},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
break;
}
}
if(_errs58 === errors){
if(data15.kind !== undefined){
let data16 = data15.kind;
if(typeof data16 !== "string"){
const err44 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
if("workspace" !== data16){
const err45 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "workspace"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
}
}
}
else {
const err46 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
var _valid1 = _errs56 === errors;
if(_valid1){
valid10 = true;
passing1 = 0;
}
const _errs61 = errors;
if(errors === _errs61){
if(data15 && typeof data15 == "object" && !Array.isArray(data15)){
let missing8;
if(((data15.kind === undefined) && (missing8 = "kind")) || ((data15.id === undefined) && (missing8 = "id"))){
const err47 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/1/required",keyword:"required",params:{missingProperty: missing8},message:"must have required property '"+missing8+"'"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
else {
const _errs63 = errors;
for(const key8 in data15){
if(!((key8 === "id") || (key8 === "kind"))){
const err48 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key8},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
break;
}
}
if(_errs63 === errors){
if(data15.id !== undefined){
const _errs64 = errors;
if(typeof data15.id !== "string"){
const err49 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/1/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
var valid12 = _errs64 === errors;
}
else {
var valid12 = true;
}
if(valid12){
if(data15.kind !== undefined){
let data18 = data15.kind;
const _errs66 = errors;
if(typeof data18 !== "string"){
const err50 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
if("voyage" !== data18){
const err51 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
var valid12 = _errs66 === errors;
}
else {
var valid12 = true;
}
}
}
}
}
else {
const err52 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
}
var _valid1 = _errs61 === errors;
if(_valid1 && valid10){
valid10 = false;
passing1 = [passing1, 1];
}
else {
if(_valid1){
valid10 = true;
passing1 = 1;
}
const _errs68 = errors;
if(errors === _errs68){
if(data15 && typeof data15 == "object" && !Array.isArray(data15)){
let missing9;
if(((data15.kind === undefined) && (missing9 = "kind")) || ((data15.id === undefined) && (missing9 = "id"))){
const err53 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/2/required",keyword:"required",params:{missingProperty: missing9},message:"must have required property '"+missing9+"'"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
else {
const _errs70 = errors;
for(const key9 in data15){
if(!((key9 === "id") || (key9 === "kind"))){
const err54 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key9},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
break;
}
}
if(_errs70 === errors){
if(data15.id !== undefined){
const _errs71 = errors;
if(typeof data15.id !== "string"){
const err55 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/2/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
var valid13 = _errs71 === errors;
}
else {
var valid13 = true;
}
if(valid13){
if(data15.kind !== undefined){
let data20 = data15.kind;
const _errs73 = errors;
if(typeof data20 !== "string"){
const err56 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
if("fleet" !== data20){
const err57 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
var valid13 = _errs73 === errors;
}
else {
var valid13 = true;
}
}
}
}
}
else {
const err58 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
}
var _valid1 = _errs68 === errors;
if(_valid1 && valid10){
valid10 = false;
passing1 = [passing1, 2];
}
else {
if(_valid1){
valid10 = true;
passing1 = 2;
}
const _errs75 = errors;
if(errors === _errs75){
if(data15 && typeof data15 == "object" && !Array.isArray(data15)){
let missing10;
if(((data15.kind === undefined) && (missing10 = "kind")) || ((data15.id === undefined) && (missing10 = "id"))){
const err59 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/3/required",keyword:"required",params:{missingProperty: missing10},message:"must have required property '"+missing10+"'"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
else {
const _errs77 = errors;
for(const key10 in data15){
if(!((key10 === "id") || (key10 === "kind"))){
const err60 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key10},message:"must NOT have additional properties"};
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
if(_errs77 === errors){
if(data15.id !== undefined){
const _errs78 = errors;
if(typeof data15.id !== "string"){
const err61 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/3/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
var valid14 = _errs78 === errors;
}
else {
var valid14 = true;
}
if(valid14){
if(data15.kind !== undefined){
let data22 = data15.kind;
const _errs80 = errors;
if(typeof data22 !== "string"){
const err62 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/3/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
if("vessel" !== data22){
const err63 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/3/properties/kind/const",keyword:"const",params:{allowedValue: "vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
var valid14 = _errs80 === errors;
}
else {
var valid14 = true;
}
}
}
}
}
else {
const err64 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
}
var _valid1 = _errs75 === errors;
if(_valid1 && valid10){
valid10 = false;
passing1 = [passing1, 3];
}
else {
if(_valid1){
valid10 = true;
passing1 = 3;
}
const _errs82 = errors;
if(errors === _errs82){
if(data15 && typeof data15 == "object" && !Array.isArray(data15)){
let missing11;
if(((data15.kind === undefined) && (missing11 = "kind")) || ((data15.id === undefined) && (missing11 = "id"))){
const err65 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/4/required",keyword:"required",params:{missingProperty: missing11},message:"must have required property '"+missing11+"'"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
else {
const _errs84 = errors;
for(const key11 in data15){
if(!((key11 === "id") || (key11 === "kind"))){
const err66 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key11},message:"must NOT have additional properties"};
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
if(_errs84 === errors){
if(data15.id !== undefined){
const _errs85 = errors;
if(typeof data15.id !== "string"){
const err67 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/4/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
var valid15 = _errs85 === errors;
}
else {
var valid15 = true;
}
if(valid15){
if(data15.kind !== undefined){
let data24 = data15.kind;
const _errs87 = errors;
if(typeof data24 !== "string"){
const err68 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/4/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
if("portal" !== data24){
const err69 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/4/properties/kind/const",keyword:"const",params:{allowedValue: "portal"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
var valid15 = _errs87 === errors;
}
else {
var valid15 = true;
}
}
}
}
}
else {
const err70 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
}
var _valid1 = _errs82 === errors;
if(_valid1 && valid10){
valid10 = false;
passing1 = [passing1, 4];
}
else {
if(_valid1){
valid10 = true;
passing1 = 4;
}
}
}
}
}
if(!valid10){
const err71 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf",keyword:"oneOf",params:{passingSchemas: passing1},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
else {
errors = _errs55;
if(vErrors !== null){
if(_errs55){
vErrors.length = _errs55;
}
else {
vErrors = null;
}
}
}
var valid8 = _errs53 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data.operation !== undefined){
let data25 = data.operation;
const _errs89 = errors;
if(typeof data25 !== "string"){
const err72 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/6/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
if("dock" !== data25){
const err73 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/6/properties/operation/const",keyword:"const",params:{allowedValue: "dock"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
var valid8 = _errs89 === errors;
}
else {
var valid8 = true;
}
}
}
}
}
else {
const err74 = {instancePath,schemaPath:"#/oneOf/6/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
}
var _valid0 = _errs50 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 6];
}
else {
if(_valid0){
valid0 = true;
passing0 = 6;
}
}
}
}
}
}
}
if(!valid0){
const err75 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
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
if((((data.requestId === undefined) && (missing0 = "requestId")) || ((data.expectedVersion === undefined) && (missing0 = "expectedVersion"))) || ((data.action === undefined) && (missing0 = "action"))){
validate15.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(((key0 === "action") || (key0 === "expectedVersion")) || (key0 === "requestId"))){
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
if(valid0){
if(data.requestId !== undefined){
const _errs5 = errors;
if(typeof data.requestId !== "string"){
validate15.errors = [{instancePath:instancePath+"/requestId",schemaPath:"#/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate15.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate15.errors = vErrors;
return errors === 0;
}

export const response = validate18;
const schema24 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"definitions":{"Axis":{"enum":["horizontal","vertical"],"type":"string"},"Content":{"additionalProperties":false,"properties":{"backend":{"type":["string","null"]},"cwd":{"type":"string"},"id":{"type":"string"},"typeId":{"type":"string"}},"required":["id","typeId","cwd"],"type":"object"},"Context":{"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"workspace","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]},"Fleet":{"additionalProperties":false,"properties":{"id":{"type":"string"},"name":{"type":"string"},"root":{"$ref":"#/definitions/Split"},"vessels":{"items":{"$ref":"#/definitions/Vessel"},"type":"array"}},"required":["id","name","vessels","root"],"type":"object"},"Layout":{"additionalProperties":false,"properties":{"contents":{"items":{"$ref":"#/definitions/Content"},"type":"array"},"context":{"$ref":"#/definitions/Context"},"nextId":{"type":"string"},"selectedFleet":{"type":["string","null"]},"selectedVoyage":{"type":["string","null"]},"voyages":{"items":{"$ref":"#/definitions/Voyage"},"type":"array"}},"required":["voyages","contents","context","nextId"],"type":"object"},"Split":{"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"leaf","type":"string"},"placement":{"type":"string"}},"required":["kind","placement"],"type":"object"},{"additionalProperties":false,"properties":{"axis":{"$ref":"#/definitions/Axis"},"first":{"$ref":"#/definitions/Split"},"kind":{"const":"branch","type":"string"},"second":{"$ref":"#/definitions/Split"}},"required":["kind","axis","first","second"],"type":"object"}]},"Status":{"enum":["applied","rejected","uncertain"],"type":"string"},"Vessel":{"additionalProperties":false,"properties":{"content":{"type":"string"},"id":{"type":"string"}},"required":["id","content"],"type":"object"},"Voyage":{"additionalProperties":false,"properties":{"fleets":{"items":{"$ref":"#/definitions/Fleet"},"type":"array"},"id":{"type":"string"},"name":{"type":"string"},"portals":{"items":{"$ref":"#/definitions/Vessel"},"type":"array"}},"required":["id","name","fleets","portals"],"type":"object"}},"properties":{"fresh":{"type":"boolean"},"layout":{"$ref":"#/definitions/Layout"},"message":{"type":["string","null"]},"requestId":{"type":"string"},"status":{"$ref":"#/definitions/Status"},"version":{"type":"string"}},"required":["requestId","status","version","layout","fresh"],"title":"Response","type":"object"};
const schema34 = {"enum":["applied","rejected","uncertain"],"type":"string"};
const schema25 = {"additionalProperties":false,"properties":{"contents":{"items":{"$ref":"#/definitions/Content"},"type":"array"},"context":{"$ref":"#/definitions/Context"},"nextId":{"type":"string"},"selectedFleet":{"type":["string","null"]},"selectedVoyage":{"type":["string","null"]},"voyages":{"items":{"$ref":"#/definitions/Voyage"},"type":"array"}},"required":["voyages","contents","context","nextId"],"type":"object"};
const schema26 = {"additionalProperties":false,"properties":{"backend":{"type":["string","null"]},"cwd":{"type":"string"},"id":{"type":"string"},"typeId":{"type":"string"}},"required":["id","typeId","cwd"],"type":"object"};
const schema27 = {"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"workspace","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]};
const schema28 = {"additionalProperties":false,"properties":{"fleets":{"items":{"$ref":"#/definitions/Fleet"},"type":"array"},"id":{"type":"string"},"name":{"type":"string"},"portals":{"items":{"$ref":"#/definitions/Vessel"},"type":"array"}},"required":["id","name","fleets","portals"],"type":"object"};
const schema32 = {"additionalProperties":false,"properties":{"content":{"type":"string"},"id":{"type":"string"}},"required":["id","content"],"type":"object"};
const schema29 = {"additionalProperties":false,"properties":{"id":{"type":"string"},"name":{"type":"string"},"root":{"$ref":"#/definitions/Split"},"vessels":{"items":{"$ref":"#/definitions/Vessel"},"type":"array"}},"required":["id","name","vessels","root"],"type":"object"};
const schema30 = {"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"leaf","type":"string"},"placement":{"type":"string"}},"required":["kind","placement"],"type":"object"},{"additionalProperties":false,"properties":{"axis":{"$ref":"#/definitions/Axis"},"first":{"$ref":"#/definitions/Split"},"kind":{"const":"branch","type":"string"},"second":{"$ref":"#/definitions/Split"}},"required":["kind","axis","first","second"],"type":"object"}]};
const schema31 = {"enum":["horizontal","vertical"],"type":"string"};
const wrapper0 = {validate: validate22};

function validate22(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
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
if(!((((key1 === "axis") || (key1 === "first")) || (key1 === "kind")) || (key1 === "second"))){
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
const err9 = {instancePath:instancePath+"/axis",schemaPath:"#/definitions/Axis/enum",keyword:"enum",params:{allowedValues: schema31.enum},message:"must be equal to one of the allowed values"};
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
}
}
}
}
}
}
else {
const err12 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
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
const err13 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
validate22.errors = vErrors;
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
validate22.errors = vErrors;
return errors === 0;
}


function validate21(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((((data.id === undefined) && (missing0 = "id")) || ((data.name === undefined) && (missing0 = "name"))) || ((data.vessels === undefined) && (missing0 = "vessels"))) || ((data.root === undefined) && (missing0 = "root"))){
validate21.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((((key0 === "id") || (key0 === "name")) || (key0 === "root")) || (key0 === "vessels"))){
validate21.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.id !== undefined){
const _errs2 = errors;
if(typeof data.id !== "string"){
validate21.errors = [{instancePath:instancePath+"/id",schemaPath:"#/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate21.errors = [{instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
if(!(validate22(data.root, {instancePath:instancePath+"/root",parentData:data,parentDataProperty:"root",rootData}))){
vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
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
validate21.errors = [{instancePath:instancePath+"/vessels/" + i0,schemaPath:"#/definitions/Vessel/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"}];
return false;
}
else {
const _errs12 = errors;
for(const key1 in data4){
if(!((key1 === "content") || (key1 === "id"))){
validate21.errors = [{instancePath:instancePath+"/vessels/" + i0,schemaPath:"#/definitions/Vessel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs12 === errors){
if(data4.content !== undefined){
const _errs13 = errors;
if(typeof data4.content !== "string"){
validate21.errors = [{instancePath:instancePath+"/vessels/" + i0+"/content",schemaPath:"#/definitions/Vessel/properties/content/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate21.errors = [{instancePath:instancePath+"/vessels/" + i0+"/id",schemaPath:"#/definitions/Vessel/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid3 = _errs15 === errors;
}
else {
var valid3 = true;
}
}
}
}
}
else {
validate21.errors = [{instancePath:instancePath+"/vessels/" + i0,schemaPath:"#/definitions/Vessel/type",keyword:"type",params:{type: "object"},message:"must be object"}];
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
validate21.errors = [{instancePath:instancePath+"/vessels",schemaPath:"#/properties/vessels/type",keyword:"type",params:{type: "array"},message:"must be array"}];
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
if(((((data.id === undefined) && (missing0 = "id")) || ((data.name === undefined) && (missing0 = "name"))) || ((data.fleets === undefined) && (missing0 = "fleets"))) || ((data.portals === undefined) && (missing0 = "portals"))){
validate20.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((((key0 === "fleets") || (key0 === "id")) || (key0 === "name")) || (key0 === "portals"))){
validate20.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
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
if(!(validate21(data0[i0], {instancePath:instancePath+"/fleets/" + i0,parentData:data0,parentDataProperty:i0,rootData}))){
vErrors = vErrors === null ? validate21.errors : vErrors.concat(validate21.errors);
errors = vErrors.length;
}
var valid1 = _errs4 === errors;
if(!valid1){
break;
}
}
}
else {
validate20.errors = [{instancePath:instancePath+"/fleets",schemaPath:"#/properties/fleets/type",keyword:"type",params:{type: "array"},message:"must be array"}];
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
validate20.errors = [{instancePath:instancePath+"/id",schemaPath:"#/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate20.errors = [{instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate20.errors = [{instancePath:instancePath+"/portals/" + i1,schemaPath:"#/definitions/Vessel/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"}];
return false;
}
else {
const _errs14 = errors;
for(const key1 in data5){
if(!((key1 === "content") || (key1 === "id"))){
validate20.errors = [{instancePath:instancePath+"/portals/" + i1,schemaPath:"#/definitions/Vessel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs14 === errors){
if(data5.content !== undefined){
const _errs15 = errors;
if(typeof data5.content !== "string"){
validate20.errors = [{instancePath:instancePath+"/portals/" + i1+"/content",schemaPath:"#/definitions/Vessel/properties/content/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate20.errors = [{instancePath:instancePath+"/portals/" + i1+"/id",schemaPath:"#/definitions/Vessel/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid4 = _errs17 === errors;
}
else {
var valid4 = true;
}
}
}
}
}
else {
validate20.errors = [{instancePath:instancePath+"/portals/" + i1,schemaPath:"#/definitions/Vessel/type",keyword:"type",params:{type: "object"},message:"must be object"}];
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
validate20.errors = [{instancePath:instancePath+"/portals",schemaPath:"#/properties/portals/type",keyword:"type",params:{type: "array"},message:"must be array"}];
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
validate20.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate20.errors = vErrors;
return errors === 0;
}


function validate19(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((((data.voyages === undefined) && (missing0 = "voyages")) || ((data.contents === undefined) && (missing0 = "contents"))) || ((data.context === undefined) && (missing0 = "context"))) || ((data.nextId === undefined) && (missing0 = "nextId"))){
validate19.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((((((key0 === "contents") || (key0 === "context")) || (key0 === "nextId")) || (key0 === "selectedFleet")) || (key0 === "selectedVoyage")) || (key0 === "voyages"))){
validate19.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
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
validate19.errors = [{instancePath:instancePath+"/contents/" + i0,schemaPath:"#/definitions/Content/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"}];
return false;
}
else {
const _errs7 = errors;
for(const key1 in data1){
if(!((((key1 === "backend") || (key1 === "cwd")) || (key1 === "id")) || (key1 === "typeId"))){
validate19.errors = [{instancePath:instancePath+"/contents/" + i0,schemaPath:"#/definitions/Content/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs7 === errors){
if(data1.backend !== undefined){
let data2 = data1.backend;
const _errs8 = errors;
if((typeof data2 !== "string") && (data2 !== null)){
validate19.errors = [{instancePath:instancePath+"/contents/" + i0+"/backend",schemaPath:"#/definitions/Content/properties/backend/type",keyword:"type",params:{type: schema26.properties.backend.type},message:"must be string,null"}];
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
validate19.errors = [{instancePath:instancePath+"/contents/" + i0+"/cwd",schemaPath:"#/definitions/Content/properties/cwd/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate19.errors = [{instancePath:instancePath+"/contents/" + i0+"/id",schemaPath:"#/definitions/Content/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid3 = _errs12 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data1.typeId !== undefined){
const _errs14 = errors;
if(typeof data1.typeId !== "string"){
validate19.errors = [{instancePath:instancePath+"/contents/" + i0+"/typeId",schemaPath:"#/definitions/Content/properties/typeId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid3 = _errs14 === errors;
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
validate19.errors = [{instancePath:instancePath+"/contents/" + i0,schemaPath:"#/definitions/Content/type",keyword:"type",params:{type: "object"},message:"must be object"}];
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
validate19.errors = [{instancePath:instancePath+"/contents",schemaPath:"#/properties/contents/type",keyword:"type",params:{type: "array"},message:"must be array"}];
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
let data6 = data.context;
const _errs16 = errors;
const _errs18 = errors;
let valid5 = false;
let passing0 = null;
const _errs19 = errors;
if(errors === _errs19){
if(data6 && typeof data6 == "object" && !Array.isArray(data6)){
let missing2;
if((data6.kind === undefined) && (missing2 = "kind")){
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
const _errs21 = errors;
for(const key2 in data6){
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
if(_errs21 === errors){
if(data6.kind !== undefined){
let data7 = data6.kind;
if(typeof data7 !== "string"){
const err2 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if("workspace" !== data7){
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
var _valid0 = _errs19 === errors;
if(_valid0){
valid5 = true;
passing0 = 0;
}
const _errs24 = errors;
if(errors === _errs24){
if(data6 && typeof data6 == "object" && !Array.isArray(data6)){
let missing3;
if(((data6.kind === undefined) && (missing3 = "kind")) || ((data6.id === undefined) && (missing3 = "id"))){
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
const _errs26 = errors;
for(const key3 in data6){
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
if(_errs26 === errors){
if(data6.id !== undefined){
const _errs27 = errors;
if(typeof data6.id !== "string"){
const err7 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/1/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
var valid7 = _errs27 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data6.kind !== undefined){
let data9 = data6.kind;
const _errs29 = errors;
if(typeof data9 !== "string"){
const err8 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if("voyage" !== data9){
const err9 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
var valid7 = _errs29 === errors;
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
var _valid0 = _errs24 === errors;
if(_valid0 && valid5){
valid5 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid5 = true;
passing0 = 1;
}
const _errs31 = errors;
if(errors === _errs31){
if(data6 && typeof data6 == "object" && !Array.isArray(data6)){
let missing4;
if(((data6.kind === undefined) && (missing4 = "kind")) || ((data6.id === undefined) && (missing4 = "id"))){
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
const _errs33 = errors;
for(const key4 in data6){
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
if(_errs33 === errors){
if(data6.id !== undefined){
const _errs34 = errors;
if(typeof data6.id !== "string"){
const err13 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/2/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
var valid8 = _errs34 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data6.kind !== undefined){
let data11 = data6.kind;
const _errs36 = errors;
if(typeof data11 !== "string"){
const err14 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if("fleet" !== data11){
const err15 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
var valid8 = _errs36 === errors;
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
var _valid0 = _errs31 === errors;
if(_valid0 && valid5){
valid5 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid5 = true;
passing0 = 2;
}
const _errs38 = errors;
if(errors === _errs38){
if(data6 && typeof data6 == "object" && !Array.isArray(data6)){
let missing5;
if(((data6.kind === undefined) && (missing5 = "kind")) || ((data6.id === undefined) && (missing5 = "id"))){
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
const _errs40 = errors;
for(const key5 in data6){
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
if(_errs40 === errors){
if(data6.id !== undefined){
const _errs41 = errors;
if(typeof data6.id !== "string"){
const err19 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/3/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
var valid9 = _errs41 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data6.kind !== undefined){
let data13 = data6.kind;
const _errs43 = errors;
if(typeof data13 !== "string"){
const err20 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/3/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if("vessel" !== data13){
const err21 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/3/properties/kind/const",keyword:"const",params:{allowedValue: "vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
var valid9 = _errs43 === errors;
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
var _valid0 = _errs38 === errors;
if(_valid0 && valid5){
valid5 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid5 = true;
passing0 = 3;
}
const _errs45 = errors;
if(errors === _errs45){
if(data6 && typeof data6 == "object" && !Array.isArray(data6)){
let missing6;
if(((data6.kind === undefined) && (missing6 = "kind")) || ((data6.id === undefined) && (missing6 = "id"))){
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
const _errs47 = errors;
for(const key6 in data6){
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
if(_errs47 === errors){
if(data6.id !== undefined){
const _errs48 = errors;
if(typeof data6.id !== "string"){
const err25 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/4/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
var valid10 = _errs48 === errors;
}
else {
var valid10 = true;
}
if(valid10){
if(data6.kind !== undefined){
let data15 = data6.kind;
const _errs50 = errors;
if(typeof data15 !== "string"){
const err26 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/4/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if("portal" !== data15){
const err27 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/4/properties/kind/const",keyword:"const",params:{allowedValue: "portal"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
var valid10 = _errs50 === errors;
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
var _valid0 = _errs45 === errors;
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
validate19.errors = vErrors;
return false;
}
else {
errors = _errs18;
if(vErrors !== null){
if(_errs18){
vErrors.length = _errs18;
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
if(valid0){
if(data.nextId !== undefined){
const _errs52 = errors;
if(typeof data.nextId !== "string"){
validate19.errors = [{instancePath:instancePath+"/nextId",schemaPath:"#/properties/nextId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs52 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.selectedFleet !== undefined){
let data17 = data.selectedFleet;
const _errs54 = errors;
if((typeof data17 !== "string") && (data17 !== null)){
validate19.errors = [{instancePath:instancePath+"/selectedFleet",schemaPath:"#/properties/selectedFleet/type",keyword:"type",params:{type: schema25.properties.selectedFleet.type},message:"must be string,null"}];
return false;
}
var valid0 = _errs54 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.selectedVoyage !== undefined){
let data18 = data.selectedVoyage;
const _errs56 = errors;
if((typeof data18 !== "string") && (data18 !== null)){
validate19.errors = [{instancePath:instancePath+"/selectedVoyage",schemaPath:"#/properties/selectedVoyage/type",keyword:"type",params:{type: schema25.properties.selectedVoyage.type},message:"must be string,null"}];
return false;
}
var valid0 = _errs56 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.voyages !== undefined){
let data19 = data.voyages;
const _errs58 = errors;
if(errors === _errs58){
if(Array.isArray(data19)){
var valid11 = true;
const len1 = data19.length;
for(let i1=0; i1<len1; i1++){
const _errs60 = errors;
if(!(validate20(data19[i1], {instancePath:instancePath+"/voyages/" + i1,parentData:data19,parentDataProperty:i1,rootData}))){
vErrors = vErrors === null ? validate20.errors : vErrors.concat(validate20.errors);
errors = vErrors.length;
}
var valid11 = _errs60 === errors;
if(!valid11){
break;
}
}
}
else {
validate19.errors = [{instancePath:instancePath+"/voyages",schemaPath:"#/properties/voyages/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
var valid0 = _errs58 === errors;
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
validate19.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate19.errors = vErrors;
return errors === 0;
}


function validate18(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((((((data.requestId === undefined) && (missing0 = "requestId")) || ((data.status === undefined) && (missing0 = "status"))) || ((data.version === undefined) && (missing0 = "version"))) || ((data.layout === undefined) && (missing0 = "layout"))) || ((data.fresh === undefined) && (missing0 = "fresh"))){
validate18.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((((((key0 === "fresh") || (key0 === "layout")) || (key0 === "message")) || (key0 === "requestId")) || (key0 === "status")) || (key0 === "version"))){
validate18.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.fresh !== undefined){
const _errs2 = errors;
if(typeof data.fresh !== "boolean"){
validate18.errors = [{instancePath:instancePath+"/fresh",schemaPath:"#/properties/fresh/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"}];
return false;
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.layout !== undefined){
const _errs4 = errors;
if(!(validate19(data.layout, {instancePath:instancePath+"/layout",parentData:data,parentDataProperty:"layout",rootData}))){
vErrors = vErrors === null ? validate19.errors : vErrors.concat(validate19.errors);
errors = vErrors.length;
}
var valid0 = _errs4 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.message !== undefined){
let data2 = data.message;
const _errs5 = errors;
if((typeof data2 !== "string") && (data2 !== null)){
validate18.errors = [{instancePath:instancePath+"/message",schemaPath:"#/properties/message/type",keyword:"type",params:{type: schema24.properties.message.type},message:"must be string,null"}];
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
if(valid0){
if(data.status !== undefined){
let data4 = data.status;
const _errs9 = errors;
if(typeof data4 !== "string"){
validate18.errors = [{instancePath:instancePath+"/status",schemaPath:"#/definitions/Status/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!(((data4 === "applied") || (data4 === "rejected")) || (data4 === "uncertain"))){
validate18.errors = [{instancePath:instancePath+"/status",schemaPath:"#/definitions/Status/enum",keyword:"enum",params:{allowedValues: schema34.enum},message:"must be equal to one of the allowed values"}];
return false;
}
var valid0 = _errs9 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.version !== undefined){
const _errs12 = errors;
if(typeof data.version !== "string"){
validate18.errors = [{instancePath:instancePath+"/version",schemaPath:"#/properties/version/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs12 === errors;
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
validate18.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate18.errors = vErrors;
return errors === 0;
}
