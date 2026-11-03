"use strict";
export const canvas = validate10;
const schema11 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"definitions":{"Node":{"oneOf":[{"additionalProperties":false,"properties":{"children":{"items":{"$ref":"#/definitions/Node"},"type":"array"},"kind":{"const":"row","type":"string"},"size":{"allOf":[{"$ref":"#/definitions/Size"}],"default":{"kind":"fill"}}},"required":["kind","children"],"type":"object"},{"additionalProperties":false,"properties":{"children":{"items":{"$ref":"#/definitions/Node"},"type":"array"},"kind":{"const":"column","type":"string"},"size":{"allOf":[{"$ref":"#/definitions/Size"}],"default":{"kind":"fill"}}},"required":["kind","children"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"block","type":"string"},"region":{"$ref":"#/definitions/Region"},"size":{"allOf":[{"$ref":"#/definitions/Size"}],"default":{"kind":"fill"}}},"required":["kind","region"],"type":"object"}]},"PortalMode":{"enum":["overlay","make-room"],"type":"string"},"Region":{"enum":["sidebar","fleet-strip","active-fleet","portals","context-bar"],"type":"string"},"Size":{"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"fill","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"content","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"fixed","type":"string"},"pixels":{"maximum":4096,"minimum":1,"type":"integer"}},"required":["kind","pixels"],"type":"object"}]}},"properties":{"portalMode":{"allOf":[{"$ref":"#/definitions/PortalMode"}],"default":"overlay"},"root":{"$ref":"#/definitions/Node"},"sidebarCollapsed":{"default":false,"type":"boolean"}},"required":["root"],"title":"Canvas","type":"object"};
const schema12 = {"enum":["overlay","make-room"],"type":"string"};
const schema13 = {"oneOf":[{"additionalProperties":false,"properties":{"children":{"items":{"$ref":"#/definitions/Node"},"type":"array"},"kind":{"const":"row","type":"string"},"size":{"allOf":[{"$ref":"#/definitions/Size"}],"default":{"kind":"fill"}}},"required":["kind","children"],"type":"object"},{"additionalProperties":false,"properties":{"children":{"items":{"$ref":"#/definitions/Node"},"type":"array"},"kind":{"const":"column","type":"string"},"size":{"allOf":[{"$ref":"#/definitions/Size"}],"default":{"kind":"fill"}}},"required":["kind","children"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"block","type":"string"},"region":{"$ref":"#/definitions/Region"},"size":{"allOf":[{"$ref":"#/definitions/Size"}],"default":{"kind":"fill"}}},"required":["kind","region"],"type":"object"}]};
const schema14 = {"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"fill","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"content","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"fixed","type":"string"},"pixels":{"maximum":4096,"minimum":1,"type":"integer"}},"required":["kind","pixels"],"type":"object"}]};
const schema16 = {"enum":["sidebar","fleet-strip","active-fleet","portals","context-bar"],"type":"string"};
const wrapper0 = {validate: validate11};

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
if(((data.kind === undefined) && (missing0 = "kind")) || ((data.children === undefined) && (missing0 = "children"))){
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
if(!(((key0 === "children") || (key0 === "kind")) || (key0 === "size"))){
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
if(data.children !== undefined){
let data0 = data.children;
const _errs4 = errors;
if(errors === _errs4){
if(Array.isArray(data0)){
var valid2 = true;
const len0 = data0.length;
for(let i0=0; i0<len0; i0++){
const _errs6 = errors;
if(!(wrapper0.validate(data0[i0], {instancePath:instancePath+"/children/" + i0,parentData:data0,parentDataProperty:i0,rootData}))){
vErrors = vErrors === null ? wrapper0.validate.errors : vErrors.concat(wrapper0.validate.errors);
errors = vErrors.length;
}
var valid2 = _errs6 === errors;
if(!valid2){
break;
}
}
}
else {
const err2 = {instancePath:instancePath+"/children",schemaPath:"#/oneOf/0/properties/children/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
var valid1 = _errs4 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.kind !== undefined){
let data2 = data.kind;
const _errs7 = errors;
if(typeof data2 !== "string"){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if("row" !== data2){
const err4 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "row"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
var valid1 = _errs7 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.size !== undefined){
let data3 = data.size;
const _errs9 = errors;
const _errs12 = errors;
let valid5 = false;
let passing1 = null;
const _errs13 = errors;
if(errors === _errs13){
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
let missing1;
if((data3.kind === undefined) && (missing1 = "kind")){
const err5 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
else {
const _errs15 = errors;
for(const key1 in data3){
if(!(key1 === "kind")){
const err6 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
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
if(_errs15 === errors){
if(data3.kind !== undefined){
let data4 = data3.kind;
if(typeof data4 !== "string"){
const err7 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if("fill" !== data4){
const err8 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "fill"},message:"must be equal to constant"};
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
const err9 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
var _valid1 = _errs13 === errors;
if(_valid1){
valid5 = true;
passing1 = 0;
}
const _errs18 = errors;
if(errors === _errs18){
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
let missing2;
if((data3.kind === undefined) && (missing2 = "kind")){
const err10 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
else {
const _errs20 = errors;
for(const key2 in data3){
if(!(key2 === "kind")){
const err11 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
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
if(_errs20 === errors){
if(data3.kind !== undefined){
let data5 = data3.kind;
if(typeof data5 !== "string"){
const err12 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if("content" !== data5){
const err13 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "content"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
}
}
else {
const err14 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
var _valid1 = _errs18 === errors;
if(_valid1 && valid5){
valid5 = false;
passing1 = [passing1, 1];
}
else {
if(_valid1){
valid5 = true;
passing1 = 1;
}
const _errs23 = errors;
if(errors === _errs23){
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
let missing3;
if(((data3.kind === undefined) && (missing3 = "kind")) || ((data3.pixels === undefined) && (missing3 = "pixels"))){
const err15 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/required",keyword:"required",params:{missingProperty: missing3},message:"must have required property '"+missing3+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
else {
const _errs25 = errors;
for(const key3 in data3){
if(!((key3 === "kind") || (key3 === "pixels"))){
const err16 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
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
if(_errs25 === errors){
if(data3.kind !== undefined){
let data6 = data3.kind;
const _errs26 = errors;
if(typeof data6 !== "string"){
const err17 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if("fixed" !== data6){
const err18 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "fixed"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
var valid8 = _errs26 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data3.pixels !== undefined){
let data7 = data3.pixels;
const _errs28 = errors;
if(!(((typeof data7 == "number") && (!(data7 % 1) && !isNaN(data7))) && (isFinite(data7)))){
const err19 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(errors === _errs28){
if((typeof data7 == "number") && (isFinite(data7))){
if(data7 > 4096 || isNaN(data7)){
const err20 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/maximum",keyword:"maximum",params:{comparison: "<=", limit: 4096},message:"must be <= 4096"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
else {
if(data7 < 1 || isNaN(data7)){
const err21 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
}
}
var valid8 = _errs28 === errors;
}
else {
var valid8 = true;
}
}
}
}
}
else {
const err22 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
var _valid1 = _errs23 === errors;
if(_valid1 && valid5){
valid5 = false;
passing1 = [passing1, 2];
}
else {
if(_valid1){
valid5 = true;
passing1 = 2;
}
}
}
if(!valid5){
const err23 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf",keyword:"oneOf",params:{passingSchemas: passing1},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
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
var valid1 = _errs9 === errors;
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
const err24 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
}
const _errs30 = errors;
if(errors === _errs30){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing4;
if(((data.kind === undefined) && (missing4 = "kind")) || ((data.children === undefined) && (missing4 = "children"))){
const err25 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: missing4},message:"must have required property '"+missing4+"'"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
else {
const _errs32 = errors;
for(const key4 in data){
if(!(((key4 === "children") || (key4 === "kind")) || (key4 === "size"))){
const err26 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
break;
}
}
if(_errs32 === errors){
if(data.children !== undefined){
let data8 = data.children;
const _errs33 = errors;
if(errors === _errs33){
if(Array.isArray(data8)){
var valid10 = true;
const len1 = data8.length;
for(let i1=0; i1<len1; i1++){
const _errs35 = errors;
if(!(wrapper0.validate(data8[i1], {instancePath:instancePath+"/children/" + i1,parentData:data8,parentDataProperty:i1,rootData}))){
vErrors = vErrors === null ? wrapper0.validate.errors : vErrors.concat(wrapper0.validate.errors);
errors = vErrors.length;
}
var valid10 = _errs35 === errors;
if(!valid10){
break;
}
}
}
else {
const err27 = {instancePath:instancePath+"/children",schemaPath:"#/oneOf/1/properties/children/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
var valid9 = _errs33 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data.kind !== undefined){
let data10 = data.kind;
const _errs36 = errors;
if(typeof data10 !== "string"){
const err28 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if("column" !== data10){
const err29 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "column"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
var valid9 = _errs36 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data.size !== undefined){
let data11 = data.size;
const _errs38 = errors;
const _errs41 = errors;
let valid13 = false;
let passing2 = null;
const _errs42 = errors;
if(errors === _errs42){
if(data11 && typeof data11 == "object" && !Array.isArray(data11)){
let missing5;
if((data11.kind === undefined) && (missing5 = "kind")){
const err30 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/required",keyword:"required",params:{missingProperty: missing5},message:"must have required property '"+missing5+"'"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
else {
const _errs44 = errors;
for(const key5 in data11){
if(!(key5 === "kind")){
const err31 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
break;
}
}
if(_errs44 === errors){
if(data11.kind !== undefined){
let data12 = data11.kind;
if(typeof data12 !== "string"){
const err32 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
if("fill" !== data12){
const err33 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "fill"},message:"must be equal to constant"};
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
}
else {
const err34 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
var _valid2 = _errs42 === errors;
if(_valid2){
valid13 = true;
passing2 = 0;
}
const _errs47 = errors;
if(errors === _errs47){
if(data11 && typeof data11 == "object" && !Array.isArray(data11)){
let missing6;
if((data11.kind === undefined) && (missing6 = "kind")){
const err35 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/required",keyword:"required",params:{missingProperty: missing6},message:"must have required property '"+missing6+"'"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
else {
const _errs49 = errors;
for(const key6 in data11){
if(!(key6 === "kind")){
const err36 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
break;
}
}
if(_errs49 === errors){
if(data11.kind !== undefined){
let data13 = data11.kind;
if(typeof data13 !== "string"){
const err37 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
if("content" !== data13){
const err38 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "content"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
}
}
}
else {
const err39 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
var _valid2 = _errs47 === errors;
if(_valid2 && valid13){
valid13 = false;
passing2 = [passing2, 1];
}
else {
if(_valid2){
valid13 = true;
passing2 = 1;
}
const _errs52 = errors;
if(errors === _errs52){
if(data11 && typeof data11 == "object" && !Array.isArray(data11)){
let missing7;
if(((data11.kind === undefined) && (missing7 = "kind")) || ((data11.pixels === undefined) && (missing7 = "pixels"))){
const err40 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/required",keyword:"required",params:{missingProperty: missing7},message:"must have required property '"+missing7+"'"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
else {
const _errs54 = errors;
for(const key7 in data11){
if(!((key7 === "kind") || (key7 === "pixels"))){
const err41 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key7},message:"must NOT have additional properties"};
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
if(_errs54 === errors){
if(data11.kind !== undefined){
let data14 = data11.kind;
const _errs55 = errors;
if(typeof data14 !== "string"){
const err42 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
if("fixed" !== data14){
const err43 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "fixed"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
var valid16 = _errs55 === errors;
}
else {
var valid16 = true;
}
if(valid16){
if(data11.pixels !== undefined){
let data15 = data11.pixels;
const _errs57 = errors;
if(!(((typeof data15 == "number") && (!(data15 % 1) && !isNaN(data15))) && (isFinite(data15)))){
const err44 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
if(errors === _errs57){
if((typeof data15 == "number") && (isFinite(data15))){
if(data15 > 4096 || isNaN(data15)){
const err45 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/maximum",keyword:"maximum",params:{comparison: "<=", limit: 4096},message:"must be <= 4096"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
else {
if(data15 < 1 || isNaN(data15)){
const err46 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
}
}
var valid16 = _errs57 === errors;
}
else {
var valid16 = true;
}
}
}
}
}
else {
const err47 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
}
var _valid2 = _errs52 === errors;
if(_valid2 && valid13){
valid13 = false;
passing2 = [passing2, 2];
}
else {
if(_valid2){
valid13 = true;
passing2 = 2;
}
}
}
if(!valid13){
const err48 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf",keyword:"oneOf",params:{passingSchemas: passing2},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
else {
errors = _errs41;
if(vErrors !== null){
if(_errs41){
vErrors.length = _errs41;
}
else {
vErrors = null;
}
}
}
var valid9 = _errs38 === errors;
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
const err49 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
var _valid0 = _errs30 === errors;
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
let missing8;
if(((data.kind === undefined) && (missing8 = "kind")) || ((data.region === undefined) && (missing8 = "region"))){
const err50 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: missing8},message:"must have required property '"+missing8+"'"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
else {
const _errs61 = errors;
for(const key8 in data){
if(!(((key8 === "kind") || (key8 === "region")) || (key8 === "size"))){
const err51 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key8},message:"must NOT have additional properties"};
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
if(_errs61 === errors){
if(data.kind !== undefined){
let data16 = data.kind;
const _errs62 = errors;
if(typeof data16 !== "string"){
const err52 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
if("block" !== data16){
const err53 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "block"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
var valid17 = _errs62 === errors;
}
else {
var valid17 = true;
}
if(valid17){
if(data.region !== undefined){
let data17 = data.region;
const _errs64 = errors;
if(typeof data17 !== "string"){
const err54 = {instancePath:instancePath+"/region",schemaPath:"#/definitions/Region/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
if(!(((((data17 === "sidebar") || (data17 === "fleet-strip")) || (data17 === "active-fleet")) || (data17 === "portals")) || (data17 === "context-bar"))){
const err55 = {instancePath:instancePath+"/region",schemaPath:"#/definitions/Region/enum",keyword:"enum",params:{allowedValues: schema16.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
var valid17 = _errs64 === errors;
}
else {
var valid17 = true;
}
if(valid17){
if(data.size !== undefined){
let data18 = data.size;
const _errs67 = errors;
const _errs70 = errors;
let valid21 = false;
let passing3 = null;
const _errs71 = errors;
if(errors === _errs71){
if(data18 && typeof data18 == "object" && !Array.isArray(data18)){
let missing9;
if((data18.kind === undefined) && (missing9 = "kind")){
const err56 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/required",keyword:"required",params:{missingProperty: missing9},message:"must have required property '"+missing9+"'"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
else {
const _errs73 = errors;
for(const key9 in data18){
if(!(key9 === "kind")){
const err57 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key9},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
break;
}
}
if(_errs73 === errors){
if(data18.kind !== undefined){
let data19 = data18.kind;
if(typeof data19 !== "string"){
const err58 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
if("fill" !== data19){
const err59 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "fill"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
}
}
}
}
else {
const err60 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
var _valid3 = _errs71 === errors;
if(_valid3){
valid21 = true;
passing3 = 0;
}
const _errs76 = errors;
if(errors === _errs76){
if(data18 && typeof data18 == "object" && !Array.isArray(data18)){
let missing10;
if((data18.kind === undefined) && (missing10 = "kind")){
const err61 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/required",keyword:"required",params:{missingProperty: missing10},message:"must have required property '"+missing10+"'"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
else {
const _errs78 = errors;
for(const key10 in data18){
if(!(key10 === "kind")){
const err62 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key10},message:"must NOT have additional properties"};
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
if(_errs78 === errors){
if(data18.kind !== undefined){
let data20 = data18.kind;
if(typeof data20 !== "string"){
const err63 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
if("content" !== data20){
const err64 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "content"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
}
}
}
}
else {
const err65 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
}
var _valid3 = _errs76 === errors;
if(_valid3 && valid21){
valid21 = false;
passing3 = [passing3, 1];
}
else {
if(_valid3){
valid21 = true;
passing3 = 1;
}
const _errs81 = errors;
if(errors === _errs81){
if(data18 && typeof data18 == "object" && !Array.isArray(data18)){
let missing11;
if(((data18.kind === undefined) && (missing11 = "kind")) || ((data18.pixels === undefined) && (missing11 = "pixels"))){
const err66 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/required",keyword:"required",params:{missingProperty: missing11},message:"must have required property '"+missing11+"'"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
else {
const _errs83 = errors;
for(const key11 in data18){
if(!((key11 === "kind") || (key11 === "pixels"))){
const err67 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key11},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
break;
}
}
if(_errs83 === errors){
if(data18.kind !== undefined){
let data21 = data18.kind;
const _errs84 = errors;
if(typeof data21 !== "string"){
const err68 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
if("fixed" !== data21){
const err69 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "fixed"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
var valid24 = _errs84 === errors;
}
else {
var valid24 = true;
}
if(valid24){
if(data18.pixels !== undefined){
let data22 = data18.pixels;
const _errs86 = errors;
if(!(((typeof data22 == "number") && (!(data22 % 1) && !isNaN(data22))) && (isFinite(data22)))){
const err70 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
if(errors === _errs86){
if((typeof data22 == "number") && (isFinite(data22))){
if(data22 > 4096 || isNaN(data22)){
const err71 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/maximum",keyword:"maximum",params:{comparison: "<=", limit: 4096},message:"must be <= 4096"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
else {
if(data22 < 1 || isNaN(data22)){
const err72 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
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
var valid24 = _errs86 === errors;
}
else {
var valid24 = true;
}
}
}
}
}
else {
const err73 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
}
var _valid3 = _errs81 === errors;
if(_valid3 && valid21){
valid21 = false;
passing3 = [passing3, 2];
}
else {
if(_valid3){
valid21 = true;
passing3 = 2;
}
}
}
if(!valid21){
const err74 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf",keyword:"oneOf",params:{passingSchemas: passing3},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
else {
errors = _errs70;
if(vErrors !== null){
if(_errs70){
vErrors.length = _errs70;
}
else {
vErrors = null;
}
}
}
var valid17 = _errs67 === errors;
}
else {
var valid17 = true;
}
}
}
}
}
}
else {
const err75 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
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
}
}
if(!valid0){
const err76 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
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


function validate10(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((data.root === undefined) && (missing0 = "root")){
validate10.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(((key0 === "portalMode") || (key0 === "root")) || (key0 === "sidebarCollapsed"))){
validate10.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.portalMode !== undefined){
let data0 = data.portalMode;
const _errs2 = errors;
if(typeof data0 !== "string"){
validate10.errors = [{instancePath:instancePath+"/portalMode",schemaPath:"#/definitions/PortalMode/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!((data0 === "overlay") || (data0 === "make-room"))){
validate10.errors = [{instancePath:instancePath+"/portalMode",schemaPath:"#/definitions/PortalMode/enum",keyword:"enum",params:{allowedValues: schema12.enum},message:"must be equal to one of the allowed values"}];
return false;
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.root !== undefined){
const _errs6 = errors;
if(!(validate11(data.root, {instancePath:instancePath+"/root",parentData:data,parentDataProperty:"root",rootData}))){
vErrors = vErrors === null ? validate11.errors : vErrors.concat(validate11.errors);
errors = vErrors.length;
}
var valid0 = _errs6 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.sidebarCollapsed !== undefined){
const _errs7 = errors;
if(typeof data.sidebarCollapsed !== "boolean"){
validate10.errors = [{instancePath:instancePath+"/sidebarCollapsed",schemaPath:"#/properties/sidebarCollapsed/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"}];
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

export const contentCatalog = validate13;
const schema18 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"definitions":{"Actions":{"additionalProperties":false,"properties":{"inputSchema":true,"names":{"items":{"type":"string"},"type":"array"},"resultSchema":true,"tool":{"type":"string"}},"required":["tool","names","inputSchema","resultSchema"],"type":"object"},"Availability":{"oneOf":[{"additionalProperties":false,"properties":{"status":{"const":"ready","type":"string"}},"required":["status"],"type":"object"},{"additionalProperties":false,"properties":{"status":{"const":"removed","type":"string"}},"required":["status"],"type":"object"},{"additionalProperties":false,"properties":{"reason":{"type":"string"},"status":{"const":"unavailable","type":"string"}},"required":["status","reason"],"type":"object"}]},"Backend":{"enum":["core-terminal"],"type":"string"},"DataDescription":{"additionalProperties":false,"properties":{"defaults":true,"schema":true},"required":["defaults"],"type":"object"},"Description":{"additionalProperties":false,"properties":{"actions":{"anyOf":[{"$ref":"#/definitions/Actions"},{"type":"null"}]},"availability":{"$ref":"#/definitions/Availability"},"backend":{"anyOf":[{"$ref":"#/definitions/Backend"},{"type":"null"}]},"configuration":{"anyOf":[{"$ref":"#/definitions/DataDescription"},{"type":"null"}]},"host":{"$ref":"#/definitions/NativeHost"},"name":{"type":"string"},"placements":{"items":{"$ref":"#/definitions/Placement"},"type":"array"},"state":{"anyOf":[{"$ref":"#/definitions/DataDescription"},{"type":"null"}]},"typeId":{"type":"string"},"view":{"$ref":"#/definitions/NativeView"}},"required":["typeId","name","availability","host","view","placements"],"type":"object"},"NativeHost":{"additionalProperties":false,"properties":{"runtime":{"type":"string"},"version":{"type":"string"}},"required":["runtime","version"],"type":"object"},"NativeView":{"additionalProperties":false,"properties":{"component":{"type":"string"},"module":{"type":"string"}},"required":["module","component"],"type":"object"},"Placement":{"enum":["fleet","voyage"],"type":"string"}},"properties":{"types":{"items":{"$ref":"#/definitions/Description"},"type":"array"}},"required":["types"],"title":"Catalog","type":"object"};
const schema19 = {"additionalProperties":false,"properties":{"actions":{"anyOf":[{"$ref":"#/definitions/Actions"},{"type":"null"}]},"availability":{"$ref":"#/definitions/Availability"},"backend":{"anyOf":[{"$ref":"#/definitions/Backend"},{"type":"null"}]},"configuration":{"anyOf":[{"$ref":"#/definitions/DataDescription"},{"type":"null"}]},"host":{"$ref":"#/definitions/NativeHost"},"name":{"type":"string"},"placements":{"items":{"$ref":"#/definitions/Placement"},"type":"array"},"state":{"anyOf":[{"$ref":"#/definitions/DataDescription"},{"type":"null"}]},"typeId":{"type":"string"},"view":{"$ref":"#/definitions/NativeView"}},"required":["typeId","name","availability","host","view","placements"],"type":"object"};
const schema20 = {"additionalProperties":false,"properties":{"inputSchema":true,"names":{"items":{"type":"string"},"type":"array"},"resultSchema":true,"tool":{"type":"string"}},"required":["tool","names","inputSchema","resultSchema"],"type":"object"};
const schema21 = {"oneOf":[{"additionalProperties":false,"properties":{"status":{"const":"ready","type":"string"}},"required":["status"],"type":"object"},{"additionalProperties":false,"properties":{"status":{"const":"removed","type":"string"}},"required":["status"],"type":"object"},{"additionalProperties":false,"properties":{"reason":{"type":"string"},"status":{"const":"unavailable","type":"string"}},"required":["status","reason"],"type":"object"}]};
const schema22 = {"enum":["core-terminal"],"type":"string"};
const schema23 = {"additionalProperties":false,"properties":{"defaults":true,"schema":true},"required":["defaults"],"type":"object"};
const schema24 = {"additionalProperties":false,"properties":{"runtime":{"type":"string"},"version":{"type":"string"}},"required":["runtime","version"],"type":"object"};
const schema25 = {"enum":["fleet","voyage"],"type":"string"};
const schema27 = {"additionalProperties":false,"properties":{"component":{"type":"string"},"module":{"type":"string"}},"required":["module","component"],"type":"object"};
const func2 = Object.prototype.hasOwnProperty;

function validate14(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((((((data.typeId === undefined) && (missing0 = "typeId")) || ((data.name === undefined) && (missing0 = "name"))) || ((data.availability === undefined) && (missing0 = "availability"))) || ((data.host === undefined) && (missing0 = "host"))) || ((data.view === undefined) && (missing0 = "view"))) || ((data.placements === undefined) && (missing0 = "placements"))){
validate14.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(func2.call(schema19.properties, key0))){
validate14.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.actions !== undefined){
let data0 = data.actions;
const _errs2 = errors;
const _errs3 = errors;
let valid1 = false;
const _errs4 = errors;
const _errs5 = errors;
if(errors === _errs5){
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
let missing1;
if(((((data0.tool === undefined) && (missing1 = "tool")) || ((data0.names === undefined) && (missing1 = "names"))) || ((data0.inputSchema === undefined) && (missing1 = "inputSchema"))) || ((data0.resultSchema === undefined) && (missing1 = "resultSchema"))){
const err0 = {instancePath:instancePath+"/actions",schemaPath:"#/definitions/Actions/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"};
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
if(!((((key1 === "inputSchema") || (key1 === "names")) || (key1 === "resultSchema")) || (key1 === "tool"))){
const err1 = {instancePath:instancePath+"/actions",schemaPath:"#/definitions/Actions/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
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
if(data0.names !== undefined){
let data1 = data0.names;
const _errs8 = errors;
if(errors === _errs8){
if(Array.isArray(data1)){
var valid4 = true;
const len0 = data1.length;
for(let i0=0; i0<len0; i0++){
const _errs10 = errors;
if(typeof data1[i0] !== "string"){
const err2 = {instancePath:instancePath+"/actions/names/" + i0,schemaPath:"#/definitions/Actions/properties/names/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
var valid4 = _errs10 === errors;
if(!valid4){
break;
}
}
}
else {
const err3 = {instancePath:instancePath+"/actions/names",schemaPath:"#/definitions/Actions/properties/names/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
var valid3 = _errs8 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data0.tool !== undefined){
const _errs12 = errors;
if(typeof data0.tool !== "string"){
const err4 = {instancePath:instancePath+"/actions/tool",schemaPath:"#/definitions/Actions/properties/tool/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
var valid3 = _errs12 === errors;
}
else {
var valid3 = true;
}
}
}
}
}
else {
const err5 = {instancePath:instancePath+"/actions",schemaPath:"#/definitions/Actions/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
var _valid0 = _errs4 === errors;
valid1 = valid1 || _valid0;
if(!valid1){
const _errs14 = errors;
if(data0 !== null){
const err6 = {instancePath:instancePath+"/actions",schemaPath:"#/properties/actions/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
var _valid0 = _errs14 === errors;
valid1 = valid1 || _valid0;
}
if(!valid1){
const err7 = {instancePath:instancePath+"/actions",schemaPath:"#/properties/actions/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
validate14.errors = vErrors;
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
if(data.availability !== undefined){
let data4 = data.availability;
const _errs16 = errors;
const _errs18 = errors;
let valid6 = false;
let passing0 = null;
const _errs19 = errors;
if(errors === _errs19){
if(data4 && typeof data4 == "object" && !Array.isArray(data4)){
let missing2;
if((data4.status === undefined) && (missing2 = "status")){
const err8 = {instancePath:instancePath+"/availability",schemaPath:"#/definitions/Availability/oneOf/0/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
else {
const _errs21 = errors;
for(const key2 in data4){
if(!(key2 === "status")){
const err9 = {instancePath:instancePath+"/availability",schemaPath:"#/definitions/Availability/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
break;
}
}
if(_errs21 === errors){
if(data4.status !== undefined){
let data5 = data4.status;
if(typeof data5 !== "string"){
const err10 = {instancePath:instancePath+"/availability/status",schemaPath:"#/definitions/Availability/oneOf/0/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if("ready" !== data5){
const err11 = {instancePath:instancePath+"/availability/status",schemaPath:"#/definitions/Availability/oneOf/0/properties/status/const",keyword:"const",params:{allowedValue: "ready"},message:"must be equal to constant"};
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
}
else {
const err12 = {instancePath:instancePath+"/availability",schemaPath:"#/definitions/Availability/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
var _valid1 = _errs19 === errors;
if(_valid1){
valid6 = true;
passing0 = 0;
}
const _errs24 = errors;
if(errors === _errs24){
if(data4 && typeof data4 == "object" && !Array.isArray(data4)){
let missing3;
if((data4.status === undefined) && (missing3 = "status")){
const err13 = {instancePath:instancePath+"/availability",schemaPath:"#/definitions/Availability/oneOf/1/required",keyword:"required",params:{missingProperty: missing3},message:"must have required property '"+missing3+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
else {
const _errs26 = errors;
for(const key3 in data4){
if(!(key3 === "status")){
const err14 = {instancePath:instancePath+"/availability",schemaPath:"#/definitions/Availability/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
break;
}
}
if(_errs26 === errors){
if(data4.status !== undefined){
let data6 = data4.status;
if(typeof data6 !== "string"){
const err15 = {instancePath:instancePath+"/availability/status",schemaPath:"#/definitions/Availability/oneOf/1/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if("removed" !== data6){
const err16 = {instancePath:instancePath+"/availability/status",schemaPath:"#/definitions/Availability/oneOf/1/properties/status/const",keyword:"const",params:{allowedValue: "removed"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
}
}
}
else {
const err17 = {instancePath:instancePath+"/availability",schemaPath:"#/definitions/Availability/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
var _valid1 = _errs24 === errors;
if(_valid1 && valid6){
valid6 = false;
passing0 = [passing0, 1];
}
else {
if(_valid1){
valid6 = true;
passing0 = 1;
}
const _errs29 = errors;
if(errors === _errs29){
if(data4 && typeof data4 == "object" && !Array.isArray(data4)){
let missing4;
if(((data4.status === undefined) && (missing4 = "status")) || ((data4.reason === undefined) && (missing4 = "reason"))){
const err18 = {instancePath:instancePath+"/availability",schemaPath:"#/definitions/Availability/oneOf/2/required",keyword:"required",params:{missingProperty: missing4},message:"must have required property '"+missing4+"'"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
else {
const _errs31 = errors;
for(const key4 in data4){
if(!((key4 === "reason") || (key4 === "status"))){
const err19 = {instancePath:instancePath+"/availability",schemaPath:"#/definitions/Availability/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
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
if(_errs31 === errors){
if(data4.reason !== undefined){
const _errs32 = errors;
if(typeof data4.reason !== "string"){
const err20 = {instancePath:instancePath+"/availability/reason",schemaPath:"#/definitions/Availability/oneOf/2/properties/reason/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
var valid9 = _errs32 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data4.status !== undefined){
let data8 = data4.status;
const _errs34 = errors;
if(typeof data8 !== "string"){
const err21 = {instancePath:instancePath+"/availability/status",schemaPath:"#/definitions/Availability/oneOf/2/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if("unavailable" !== data8){
const err22 = {instancePath:instancePath+"/availability/status",schemaPath:"#/definitions/Availability/oneOf/2/properties/status/const",keyword:"const",params:{allowedValue: "unavailable"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
var valid9 = _errs34 === errors;
}
else {
var valid9 = true;
}
}
}
}
}
else {
const err23 = {instancePath:instancePath+"/availability",schemaPath:"#/definitions/Availability/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
var _valid1 = _errs29 === errors;
if(_valid1 && valid6){
valid6 = false;
passing0 = [passing0, 2];
}
else {
if(_valid1){
valid6 = true;
passing0 = 2;
}
}
}
if(!valid6){
const err24 = {instancePath:instancePath+"/availability",schemaPath:"#/definitions/Availability/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
validate14.errors = vErrors;
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
if(data.backend !== undefined){
let data9 = data.backend;
const _errs36 = errors;
const _errs37 = errors;
let valid10 = false;
const _errs38 = errors;
if(typeof data9 !== "string"){
const err25 = {instancePath:instancePath+"/backend",schemaPath:"#/definitions/Backend/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(!(data9 === "core-terminal")){
const err26 = {instancePath:instancePath+"/backend",schemaPath:"#/definitions/Backend/enum",keyword:"enum",params:{allowedValues: schema22.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
var _valid2 = _errs38 === errors;
valid10 = valid10 || _valid2;
if(!valid10){
const _errs41 = errors;
if(data9 !== null){
const err27 = {instancePath:instancePath+"/backend",schemaPath:"#/properties/backend/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
var _valid2 = _errs41 === errors;
valid10 = valid10 || _valid2;
}
if(!valid10){
const err28 = {instancePath:instancePath+"/backend",schemaPath:"#/properties/backend/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
validate14.errors = vErrors;
return false;
}
else {
errors = _errs37;
if(vErrors !== null){
if(_errs37){
vErrors.length = _errs37;
}
else {
vErrors = null;
}
}
}
var valid0 = _errs36 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.configuration !== undefined){
let data10 = data.configuration;
const _errs43 = errors;
const _errs44 = errors;
let valid12 = false;
const _errs45 = errors;
const _errs46 = errors;
if(errors === _errs46){
if(data10 && typeof data10 == "object" && !Array.isArray(data10)){
let missing5;
if((data10.defaults === undefined) && (missing5 = "defaults")){
const err29 = {instancePath:instancePath+"/configuration",schemaPath:"#/definitions/DataDescription/required",keyword:"required",params:{missingProperty: missing5},message:"must have required property '"+missing5+"'"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
else {
for(const key5 in data10){
if(!((key5 === "defaults") || (key5 === "schema"))){
const err30 = {instancePath:instancePath+"/configuration",schemaPath:"#/definitions/DataDescription/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
break;
}
}
}
}
else {
const err31 = {instancePath:instancePath+"/configuration",schemaPath:"#/definitions/DataDescription/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
var _valid3 = _errs45 === errors;
valid12 = valid12 || _valid3;
if(!valid12){
const _errs49 = errors;
if(data10 !== null){
const err32 = {instancePath:instancePath+"/configuration",schemaPath:"#/properties/configuration/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
var _valid3 = _errs49 === errors;
valid12 = valid12 || _valid3;
}
if(!valid12){
const err33 = {instancePath:instancePath+"/configuration",schemaPath:"#/properties/configuration/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
validate14.errors = vErrors;
return false;
}
else {
errors = _errs44;
if(vErrors !== null){
if(_errs44){
vErrors.length = _errs44;
}
else {
vErrors = null;
}
}
}
var valid0 = _errs43 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.host !== undefined){
let data11 = data.host;
const _errs51 = errors;
const _errs52 = errors;
if(errors === _errs52){
if(data11 && typeof data11 == "object" && !Array.isArray(data11)){
let missing6;
if(((data11.runtime === undefined) && (missing6 = "runtime")) || ((data11.version === undefined) && (missing6 = "version"))){
validate14.errors = [{instancePath:instancePath+"/host",schemaPath:"#/definitions/NativeHost/required",keyword:"required",params:{missingProperty: missing6},message:"must have required property '"+missing6+"'"}];
return false;
}
else {
const _errs54 = errors;
for(const key6 in data11){
if(!((key6 === "runtime") || (key6 === "version"))){
validate14.errors = [{instancePath:instancePath+"/host",schemaPath:"#/definitions/NativeHost/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs54 === errors){
if(data11.runtime !== undefined){
const _errs55 = errors;
if(typeof data11.runtime !== "string"){
validate14.errors = [{instancePath:instancePath+"/host/runtime",schemaPath:"#/definitions/NativeHost/properties/runtime/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid15 = _errs55 === errors;
}
else {
var valid15 = true;
}
if(valid15){
if(data11.version !== undefined){
const _errs57 = errors;
if(typeof data11.version !== "string"){
validate14.errors = [{instancePath:instancePath+"/host/version",schemaPath:"#/definitions/NativeHost/properties/version/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid15 = _errs57 === errors;
}
else {
var valid15 = true;
}
}
}
}
}
else {
validate14.errors = [{instancePath:instancePath+"/host",schemaPath:"#/definitions/NativeHost/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
var valid0 = _errs51 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.name !== undefined){
const _errs59 = errors;
if(typeof data.name !== "string"){
validate14.errors = [{instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs59 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.placements !== undefined){
let data15 = data.placements;
const _errs61 = errors;
if(errors === _errs61){
if(Array.isArray(data15)){
var valid16 = true;
const len1 = data15.length;
for(let i1=0; i1<len1; i1++){
let data16 = data15[i1];
const _errs63 = errors;
if(typeof data16 !== "string"){
validate14.errors = [{instancePath:instancePath+"/placements/" + i1,schemaPath:"#/definitions/Placement/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!((data16 === "fleet") || (data16 === "voyage"))){
validate14.errors = [{instancePath:instancePath+"/placements/" + i1,schemaPath:"#/definitions/Placement/enum",keyword:"enum",params:{allowedValues: schema25.enum},message:"must be equal to one of the allowed values"}];
return false;
}
var valid16 = _errs63 === errors;
if(!valid16){
break;
}
}
}
else {
validate14.errors = [{instancePath:instancePath+"/placements",schemaPath:"#/properties/placements/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
var valid0 = _errs61 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.state !== undefined){
let data17 = data.state;
const _errs66 = errors;
const _errs67 = errors;
let valid18 = false;
const _errs68 = errors;
const _errs69 = errors;
if(errors === _errs69){
if(data17 && typeof data17 == "object" && !Array.isArray(data17)){
let missing7;
if((data17.defaults === undefined) && (missing7 = "defaults")){
const err34 = {instancePath:instancePath+"/state",schemaPath:"#/definitions/DataDescription/required",keyword:"required",params:{missingProperty: missing7},message:"must have required property '"+missing7+"'"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
else {
for(const key7 in data17){
if(!((key7 === "defaults") || (key7 === "schema"))){
const err35 = {instancePath:instancePath+"/state",schemaPath:"#/definitions/DataDescription/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key7},message:"must NOT have additional properties"};
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
}
}
else {
const err36 = {instancePath:instancePath+"/state",schemaPath:"#/definitions/DataDescription/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
var _valid4 = _errs68 === errors;
valid18 = valid18 || _valid4;
if(!valid18){
const _errs72 = errors;
if(data17 !== null){
const err37 = {instancePath:instancePath+"/state",schemaPath:"#/properties/state/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
var _valid4 = _errs72 === errors;
valid18 = valid18 || _valid4;
}
if(!valid18){
const err38 = {instancePath:instancePath+"/state",schemaPath:"#/properties/state/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
validate14.errors = vErrors;
return false;
}
else {
errors = _errs67;
if(vErrors !== null){
if(_errs67){
vErrors.length = _errs67;
}
else {
vErrors = null;
}
}
}
var valid0 = _errs66 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.typeId !== undefined){
const _errs74 = errors;
if(typeof data.typeId !== "string"){
validate14.errors = [{instancePath:instancePath+"/typeId",schemaPath:"#/properties/typeId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs74 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.view !== undefined){
let data19 = data.view;
const _errs76 = errors;
const _errs77 = errors;
if(errors === _errs77){
if(data19 && typeof data19 == "object" && !Array.isArray(data19)){
let missing8;
if(((data19.module === undefined) && (missing8 = "module")) || ((data19.component === undefined) && (missing8 = "component"))){
validate14.errors = [{instancePath:instancePath+"/view",schemaPath:"#/definitions/NativeView/required",keyword:"required",params:{missingProperty: missing8},message:"must have required property '"+missing8+"'"}];
return false;
}
else {
const _errs79 = errors;
for(const key8 in data19){
if(!((key8 === "component") || (key8 === "module"))){
validate14.errors = [{instancePath:instancePath+"/view",schemaPath:"#/definitions/NativeView/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key8},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs79 === errors){
if(data19.component !== undefined){
const _errs80 = errors;
if(typeof data19.component !== "string"){
validate14.errors = [{instancePath:instancePath+"/view/component",schemaPath:"#/definitions/NativeView/properties/component/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid21 = _errs80 === errors;
}
else {
var valid21 = true;
}
if(valid21){
if(data19.module !== undefined){
const _errs82 = errors;
if(typeof data19.module !== "string"){
validate14.errors = [{instancePath:instancePath+"/view/module",schemaPath:"#/definitions/NativeView/properties/module/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid21 = _errs82 === errors;
}
else {
var valid21 = true;
}
}
}
}
}
else {
validate14.errors = [{instancePath:instancePath+"/view",schemaPath:"#/definitions/NativeView/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
var valid0 = _errs76 === errors;
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
}
else {
validate14.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate14.errors = vErrors;
return errors === 0;
}


function validate13(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((data.types === undefined) && (missing0 = "types")){
validate13.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(key0 === "types")){
validate13.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.types !== undefined){
let data0 = data.types;
const _errs2 = errors;
if(errors === _errs2){
if(Array.isArray(data0)){
var valid1 = true;
const len0 = data0.length;
for(let i0=0; i0<len0; i0++){
const _errs4 = errors;
if(!(validate14(data0[i0], {instancePath:instancePath+"/types/" + i0,parentData:data0,parentDataProperty:i0,rootData}))){
vErrors = vErrors === null ? validate14.errors : vErrors.concat(validate14.errors);
errors = vErrors.length;
}
var valid1 = _errs4 === errors;
if(!valid1){
break;
}
}
}
else {
validate13.errors = [{instancePath:instancePath+"/types",schemaPath:"#/properties/types/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
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

export const contentRequest = validate16;
const schema28 = {"$schema":"http://json-schema.org/draft-07/schema#","definitions":{"Notes":{"additionalProperties":false,"properties":{"text":{"type":"string"},"title":{"type":"string"}},"required":["title","text"],"type":"object"},"Version":{"enum":["1"],"type":"string"}},"oneOf":[{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"content.describe","type":"string"},"requestId":{"type":"string"},"version":{"$ref":"#/definitions/Version"}},"required":["operation","version","requestId","contentId"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"content.inspect","type":"string"},"requestId":{"type":"string"},"version":{"$ref":"#/definitions/Version"}},"required":["operation","version","requestId","contentId"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"data":{"$ref":"#/definitions/Notes"},"expectedRevision":{"type":"string"},"operation":{"const":"content.update","type":"string"},"requestId":{"type":"string"},"version":{"$ref":"#/definitions/Version"}},"required":["operation","version","requestId","contentId","expectedRevision","data"],"type":"object"}],"title":"Request"};
const schema29 = {"enum":["1"],"type":"string"};
const schema31 = {"additionalProperties":false,"properties":{"text":{"type":"string"},"title":{"type":"string"}},"required":["title","text"],"type":"object"};

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
const err7 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/enum",keyword:"enum",params:{allowedValues: schema29.enum},message:"must be equal to one of the allowed values"};
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
const err16 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/enum",keyword:"enum",params:{allowedValues: schema29.enum},message:"must be equal to one of the allowed values"};
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
const err31 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/enum",keyword:"enum",params:{allowedValues: schema29.enum},message:"must be equal to one of the allowed values"};
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

export const contentResponse = validate17;
const schema33 = {"$schema":"http://json-schema.org/draft-07/schema#","definitions":{"Notes":{"additionalProperties":false,"properties":{"text":{"type":"string"},"title":{"type":"string"}},"required":["title","text"],"type":"object"},"Snapshot":{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"data":{"$ref":"#/definitions/Notes"},"revision":{"type":"string"},"warning":{"type":["string","null"]}},"required":["contentId","revision","data"],"type":"object"},"Version":{"enum":["1"],"type":"string"}},"oneOf":[{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"message":{"type":"string"},"requestId":{"type":"string"},"revision":{"type":["string","null"]},"status":{"const":"limited","type":"string"},"version":{"$ref":"#/definitions/Version"},"warningPresent":{"type":"boolean"}},"required":["status","version","requestId","contentId","warningPresent","message"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"requestId":{"type":"string"},"schemaDeclared":{"type":"boolean"},"stateSchema":true,"status":{"const":"described","type":"string"},"version":{"$ref":"#/definitions/Version"}},"required":["status","version","requestId","contentId","schemaDeclared"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"requestId":{"type":"string"},"snapshot":{"$ref":"#/definitions/Snapshot"},"status":{"const":"snapshot","type":"string"},"version":{"$ref":"#/definitions/Version"}},"required":["status","version","requestId","contentId","snapshot"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"requestId":{"type":"string"},"snapshot":{"$ref":"#/definitions/Snapshot"},"status":{"const":"applied","type":"string"},"version":{"$ref":"#/definitions/Version"}},"required":["status","version","requestId","contentId","snapshot"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"expectedRevision":{"type":["string","null"]},"message":{"type":"string"},"requestId":{"type":"string"},"status":{"const":"rejected","type":"string"},"version":{"$ref":"#/definitions/Version"}},"required":["status","version","requestId","contentId","message"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"expectedRevision":{"type":"string"},"message":{"type":"string"},"requestId":{"type":"string"},"status":{"const":"uncertain","type":"string"},"version":{"$ref":"#/definitions/Version"}},"required":["status","version","requestId","contentId","expectedRevision","message"],"type":"object"}],"title":"Response"};
const schema34 = {"enum":["1"],"type":"string"};
const schema36 = {"additionalProperties":false,"properties":{"contentId":{"type":"string"},"data":{"$ref":"#/definitions/Notes"},"revision":{"type":"string"},"warning":{"type":["string","null"]}},"required":["contentId","revision","data"],"type":"object"};
const schema37 = {"additionalProperties":false,"properties":{"text":{"type":"string"},"title":{"type":"string"}},"required":["title","text"],"type":"object"};

function validate18(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((((data.contentId === undefined) && (missing0 = "contentId")) || ((data.revision === undefined) && (missing0 = "revision"))) || ((data.data === undefined) && (missing0 = "data"))){
validate18.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((((key0 === "contentId") || (key0 === "data")) || (key0 === "revision")) || (key0 === "warning"))){
validate18.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.contentId !== undefined){
const _errs2 = errors;
if(typeof data.contentId !== "string"){
validate18.errors = [{instancePath:instancePath+"/contentId",schemaPath:"#/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate18.errors = [{instancePath:instancePath+"/data",schemaPath:"#/definitions/Notes/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"}];
return false;
}
else {
const _errs7 = errors;
for(const key1 in data1){
if(!((key1 === "text") || (key1 === "title"))){
validate18.errors = [{instancePath:instancePath+"/data",schemaPath:"#/definitions/Notes/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs7 === errors){
if(data1.text !== undefined){
const _errs8 = errors;
if(typeof data1.text !== "string"){
validate18.errors = [{instancePath:instancePath+"/data/text",schemaPath:"#/definitions/Notes/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate18.errors = [{instancePath:instancePath+"/data/title",schemaPath:"#/definitions/Notes/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate18.errors = [{instancePath:instancePath+"/data",schemaPath:"#/definitions/Notes/type",keyword:"type",params:{type: "object"},message:"must be object"}];
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
validate18.errors = [{instancePath:instancePath+"/revision",schemaPath:"#/properties/revision/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate18.errors = [{instancePath:instancePath+"/warning",schemaPath:"#/properties/warning/type",keyword:"type",params:{type: schema36.properties.warning.type},message:"must be string,null"}];
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
validate18.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate18.errors = vErrors;
return errors === 0;
}


function validate17(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
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
const err5 = {instancePath:instancePath+"/revision",schemaPath:"#/oneOf/0/properties/revision/type",keyword:"type",params:{type: schema33.oneOf[0].properties.revision.type},message:"must be string,null"};
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
const err9 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/enum",keyword:"enum",params:{allowedValues: schema34.enum},message:"must be equal to one of the allowed values"};
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
const err20 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/enum",keyword:"enum",params:{allowedValues: schema34.enum},message:"must be equal to one of the allowed values"};
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
if(!(validate18(data.snapshot, {instancePath:instancePath+"/snapshot",parentData:data,parentDataProperty:"snapshot",rootData}))){
vErrors = vErrors === null ? validate18.errors : vErrors.concat(validate18.errors);
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
const err29 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/enum",keyword:"enum",params:{allowedValues: schema34.enum},message:"must be equal to one of the allowed values"};
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
if(!(validate18(data.snapshot, {instancePath:instancePath+"/snapshot",parentData:data,parentDataProperty:"snapshot",rootData}))){
vErrors = vErrors === null ? validate18.errors : vErrors.concat(validate18.errors);
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
const err38 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/enum",keyword:"enum",params:{allowedValues: schema34.enum},message:"must be equal to one of the allowed values"};
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
const err43 = {instancePath:instancePath+"/expectedRevision",schemaPath:"#/oneOf/4/properties/expectedRevision/type",keyword:"type",params:{type: schema33.oneOf[4].properties.expectedRevision.type},message:"must be string,null"};
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
const err49 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/enum",keyword:"enum",params:{allowedValues: schema34.enum},message:"must be equal to one of the allowed values"};
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
const err60 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/Version/enum",keyword:"enum",params:{allowedValues: schema34.enum},message:"must be equal to one of the allowed values"};
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
validate17.errors = vErrors;
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
validate17.errors = vErrors;
return errors === 0;
}

export const contentTool = validate21;
const schema42 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"definitions":{"Action":{"oneOf":[{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"describe","type":"string"}},"required":["operation","contentId"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"inspect","type":"string"}},"required":["operation","contentId"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"data":{"$ref":"#/definitions/Notes"},"expectedRevision":{"type":"string"},"operation":{"const":"update","type":"string"}},"required":["operation","contentId","expectedRevision","data"],"type":"object"}]},"Notes":{"additionalProperties":false,"properties":{"text":{"type":"string"},"title":{"type":"string"}},"required":["title","text"],"type":"object"}},"properties":{"action":{"$ref":"#/definitions/Action"},"expectedVersion":{"type":"string"}},"required":["expectedVersion","action"],"title":"Input","type":"object"};
const schema43 = {"oneOf":[{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"describe","type":"string"}},"required":["operation","contentId"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"inspect","type":"string"}},"required":["operation","contentId"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"data":{"$ref":"#/definitions/Notes"},"expectedRevision":{"type":"string"},"operation":{"const":"update","type":"string"}},"required":["operation","contentId","expectedRevision","data"],"type":"object"}]};
const schema44 = {"additionalProperties":false,"properties":{"text":{"type":"string"},"title":{"type":"string"}},"required":["title","text"],"type":"object"};

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
if(((data.expectedVersion === undefined) && (missing0 = "expectedVersion")) || ((data.action === undefined) && (missing0 = "action"))){
validate21.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((key0 === "action") || (key0 === "expectedVersion"))){
validate21.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.action !== undefined){
const _errs2 = errors;
if(!(validate22(data.action, {instancePath:instancePath+"/action",parentData:data,parentDataProperty:"action",rootData}))){
vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
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
validate21.errors = [{instancePath:instancePath+"/expectedVersion",schemaPath:"#/properties/expectedVersion/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate21.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate21.errors = vErrors;
return errors === 0;
}

export const contextFacts = validate24;
const schema45 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"definitions":{"Branch":{"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"named","type":"string"},"name":{"type":"string"}},"required":["kind","name"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"detached","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"unavailable","type":"string"}},"required":["kind"],"type":"object"}]},"Context":{"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"workspace","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]},"Directory":{"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"known","type":"string"},"path":{"type":"string"}},"required":["kind","path"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"multiple","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"unavailable","type":"string"}},"required":["kind"],"type":"object"}]}},"properties":{"branch":{"$ref":"#/definitions/Branch"},"directory":{"$ref":"#/definitions/Directory"},"path":{"items":{"type":"string"},"type":"array"},"scope":{"$ref":"#/definitions/Context"},"version":{"type":"string"}},"required":["version","scope","path","directory","branch"],"title":"Facts","type":"object"};
const schema46 = {"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"named","type":"string"},"name":{"type":"string"}},"required":["kind","name"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"detached","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"unavailable","type":"string"}},"required":["kind"],"type":"object"}]};
const schema47 = {"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"known","type":"string"},"path":{"type":"string"}},"required":["kind","path"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"multiple","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"unavailable","type":"string"}},"required":["kind"],"type":"object"}]};
const schema48 = {"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"workspace","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]};

function validate24(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((((((data.version === undefined) && (missing0 = "version")) || ((data.scope === undefined) && (missing0 = "scope"))) || ((data.path === undefined) && (missing0 = "path"))) || ((data.directory === undefined) && (missing0 = "directory"))) || ((data.branch === undefined) && (missing0 = "branch"))){
validate24.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(((((key0 === "branch") || (key0 === "directory")) || (key0 === "path")) || (key0 === "scope")) || (key0 === "version"))){
validate24.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.branch !== undefined){
let data0 = data.branch;
const _errs2 = errors;
const _errs4 = errors;
let valid2 = false;
let passing0 = null;
const _errs5 = errors;
if(errors === _errs5){
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
let missing1;
if(((data0.kind === undefined) && (missing1 = "kind")) || ((data0.name === undefined) && (missing1 = "name"))){
const err0 = {instancePath:instancePath+"/branch",schemaPath:"#/definitions/Branch/oneOf/0/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"};
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
if(!((key1 === "kind") || (key1 === "name"))){
const err1 = {instancePath:instancePath+"/branch",schemaPath:"#/definitions/Branch/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
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
if(data0.kind !== undefined){
let data1 = data0.kind;
const _errs8 = errors;
if(typeof data1 !== "string"){
const err2 = {instancePath:instancePath+"/branch/kind",schemaPath:"#/definitions/Branch/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if("named" !== data1){
const err3 = {instancePath:instancePath+"/branch/kind",schemaPath:"#/definitions/Branch/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "named"},message:"must be equal to constant"};
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
if(data0.name !== undefined){
const _errs10 = errors;
if(typeof data0.name !== "string"){
const err4 = {instancePath:instancePath+"/branch/name",schemaPath:"#/definitions/Branch/oneOf/0/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
const err5 = {instancePath:instancePath+"/branch",schemaPath:"#/definitions/Branch/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
if((data0.kind === undefined) && (missing2 = "kind")){
const err6 = {instancePath:instancePath+"/branch",schemaPath:"#/definitions/Branch/oneOf/1/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"};
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
if(!(key2 === "kind")){
const err7 = {instancePath:instancePath+"/branch",schemaPath:"#/definitions/Branch/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
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
if(data0.kind !== undefined){
let data3 = data0.kind;
if(typeof data3 !== "string"){
const err8 = {instancePath:instancePath+"/branch/kind",schemaPath:"#/definitions/Branch/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if("detached" !== data3){
const err9 = {instancePath:instancePath+"/branch/kind",schemaPath:"#/definitions/Branch/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "detached"},message:"must be equal to constant"};
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
const err10 = {instancePath:instancePath+"/branch",schemaPath:"#/definitions/Branch/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
const _errs17 = errors;
if(errors === _errs17){
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
let missing3;
if((data0.kind === undefined) && (missing3 = "kind")){
const err11 = {instancePath:instancePath+"/branch",schemaPath:"#/definitions/Branch/oneOf/2/required",keyword:"required",params:{missingProperty: missing3},message:"must have required property '"+missing3+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
else {
const _errs19 = errors;
for(const key3 in data0){
if(!(key3 === "kind")){
const err12 = {instancePath:instancePath+"/branch",schemaPath:"#/definitions/Branch/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
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
if(_errs19 === errors){
if(data0.kind !== undefined){
let data4 = data0.kind;
if(typeof data4 !== "string"){
const err13 = {instancePath:instancePath+"/branch/kind",schemaPath:"#/definitions/Branch/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if("unavailable" !== data4){
const err14 = {instancePath:instancePath+"/branch/kind",schemaPath:"#/definitions/Branch/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "unavailable"},message:"must be equal to constant"};
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
}
else {
const err15 = {instancePath:instancePath+"/branch",schemaPath:"#/definitions/Branch/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
var _valid0 = _errs17 === errors;
if(_valid0 && valid2){
valid2 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid2 = true;
passing0 = 2;
}
}
}
if(!valid2){
const err16 = {instancePath:instancePath+"/branch",schemaPath:"#/definitions/Branch/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
validate24.errors = vErrors;
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
if(data.directory !== undefined){
let data5 = data.directory;
const _errs22 = errors;
const _errs24 = errors;
let valid7 = false;
let passing1 = null;
const _errs25 = errors;
if(errors === _errs25){
if(data5 && typeof data5 == "object" && !Array.isArray(data5)){
let missing4;
if(((data5.kind === undefined) && (missing4 = "kind")) || ((data5.path === undefined) && (missing4 = "path"))){
const err17 = {instancePath:instancePath+"/directory",schemaPath:"#/definitions/Directory/oneOf/0/required",keyword:"required",params:{missingProperty: missing4},message:"must have required property '"+missing4+"'"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
else {
const _errs27 = errors;
for(const key4 in data5){
if(!((key4 === "kind") || (key4 === "path"))){
const err18 = {instancePath:instancePath+"/directory",schemaPath:"#/definitions/Directory/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
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
if(_errs27 === errors){
if(data5.kind !== undefined){
let data6 = data5.kind;
const _errs28 = errors;
if(typeof data6 !== "string"){
const err19 = {instancePath:instancePath+"/directory/kind",schemaPath:"#/definitions/Directory/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if("known" !== data6){
const err20 = {instancePath:instancePath+"/directory/kind",schemaPath:"#/definitions/Directory/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "known"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
var valid8 = _errs28 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data5.path !== undefined){
const _errs30 = errors;
if(typeof data5.path !== "string"){
const err21 = {instancePath:instancePath+"/directory/path",schemaPath:"#/definitions/Directory/oneOf/0/properties/path/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
var valid8 = _errs30 === errors;
}
else {
var valid8 = true;
}
}
}
}
}
else {
const err22 = {instancePath:instancePath+"/directory",schemaPath:"#/definitions/Directory/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
var _valid1 = _errs25 === errors;
if(_valid1){
valid7 = true;
passing1 = 0;
}
const _errs32 = errors;
if(errors === _errs32){
if(data5 && typeof data5 == "object" && !Array.isArray(data5)){
let missing5;
if((data5.kind === undefined) && (missing5 = "kind")){
const err23 = {instancePath:instancePath+"/directory",schemaPath:"#/definitions/Directory/oneOf/1/required",keyword:"required",params:{missingProperty: missing5},message:"must have required property '"+missing5+"'"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
else {
const _errs34 = errors;
for(const key5 in data5){
if(!(key5 === "kind")){
const err24 = {instancePath:instancePath+"/directory",schemaPath:"#/definitions/Directory/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
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
if(_errs34 === errors){
if(data5.kind !== undefined){
let data8 = data5.kind;
if(typeof data8 !== "string"){
const err25 = {instancePath:instancePath+"/directory/kind",schemaPath:"#/definitions/Directory/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if("multiple" !== data8){
const err26 = {instancePath:instancePath+"/directory/kind",schemaPath:"#/definitions/Directory/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "multiple"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
}
}
}
else {
const err27 = {instancePath:instancePath+"/directory",schemaPath:"#/definitions/Directory/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
var _valid1 = _errs32 === errors;
if(_valid1 && valid7){
valid7 = false;
passing1 = [passing1, 1];
}
else {
if(_valid1){
valid7 = true;
passing1 = 1;
}
const _errs37 = errors;
if(errors === _errs37){
if(data5 && typeof data5 == "object" && !Array.isArray(data5)){
let missing6;
if((data5.kind === undefined) && (missing6 = "kind")){
const err28 = {instancePath:instancePath+"/directory",schemaPath:"#/definitions/Directory/oneOf/2/required",keyword:"required",params:{missingProperty: missing6},message:"must have required property '"+missing6+"'"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
else {
const _errs39 = errors;
for(const key6 in data5){
if(!(key6 === "kind")){
const err29 = {instancePath:instancePath+"/directory",schemaPath:"#/definitions/Directory/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
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
if(_errs39 === errors){
if(data5.kind !== undefined){
let data9 = data5.kind;
if(typeof data9 !== "string"){
const err30 = {instancePath:instancePath+"/directory/kind",schemaPath:"#/definitions/Directory/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
if("unavailable" !== data9){
const err31 = {instancePath:instancePath+"/directory/kind",schemaPath:"#/definitions/Directory/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "unavailable"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
}
}
}
else {
const err32 = {instancePath:instancePath+"/directory",schemaPath:"#/definitions/Directory/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
var _valid1 = _errs37 === errors;
if(_valid1 && valid7){
valid7 = false;
passing1 = [passing1, 2];
}
else {
if(_valid1){
valid7 = true;
passing1 = 2;
}
}
}
if(!valid7){
const err33 = {instancePath:instancePath+"/directory",schemaPath:"#/definitions/Directory/oneOf",keyword:"oneOf",params:{passingSchemas: passing1},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
validate24.errors = vErrors;
return false;
}
else {
errors = _errs24;
if(vErrors !== null){
if(_errs24){
vErrors.length = _errs24;
}
else {
vErrors = null;
}
}
}
var valid0 = _errs22 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.path !== undefined){
let data10 = data.path;
const _errs42 = errors;
if(errors === _errs42){
if(Array.isArray(data10)){
var valid11 = true;
const len0 = data10.length;
for(let i0=0; i0<len0; i0++){
const _errs44 = errors;
if(typeof data10[i0] !== "string"){
validate24.errors = [{instancePath:instancePath+"/path/" + i0,schemaPath:"#/properties/path/items/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid11 = _errs44 === errors;
if(!valid11){
break;
}
}
}
else {
validate24.errors = [{instancePath:instancePath+"/path",schemaPath:"#/properties/path/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
var valid0 = _errs42 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.scope !== undefined){
let data12 = data.scope;
const _errs46 = errors;
const _errs48 = errors;
let valid13 = false;
let passing2 = null;
const _errs49 = errors;
if(errors === _errs49){
if(data12 && typeof data12 == "object" && !Array.isArray(data12)){
let missing7;
if((data12.kind === undefined) && (missing7 = "kind")){
const err34 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf/0/required",keyword:"required",params:{missingProperty: missing7},message:"must have required property '"+missing7+"'"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
else {
const _errs51 = errors;
for(const key7 in data12){
if(!(key7 === "kind")){
const err35 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key7},message:"must NOT have additional properties"};
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
if(_errs51 === errors){
if(data12.kind !== undefined){
let data13 = data12.kind;
if(typeof data13 !== "string"){
const err36 = {instancePath:instancePath+"/scope/kind",schemaPath:"#/definitions/Context/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
if("workspace" !== data13){
const err37 = {instancePath:instancePath+"/scope/kind",schemaPath:"#/definitions/Context/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "workspace"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
}
}
}
else {
const err38 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
var _valid2 = _errs49 === errors;
if(_valid2){
valid13 = true;
passing2 = 0;
}
const _errs54 = errors;
if(errors === _errs54){
if(data12 && typeof data12 == "object" && !Array.isArray(data12)){
let missing8;
if(((data12.kind === undefined) && (missing8 = "kind")) || ((data12.id === undefined) && (missing8 = "id"))){
const err39 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf/1/required",keyword:"required",params:{missingProperty: missing8},message:"must have required property '"+missing8+"'"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
else {
const _errs56 = errors;
for(const key8 in data12){
if(!((key8 === "id") || (key8 === "kind"))){
const err40 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key8},message:"must NOT have additional properties"};
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
if(_errs56 === errors){
if(data12.id !== undefined){
const _errs57 = errors;
if(typeof data12.id !== "string"){
const err41 = {instancePath:instancePath+"/scope/id",schemaPath:"#/definitions/Context/oneOf/1/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
var valid15 = _errs57 === errors;
}
else {
var valid15 = true;
}
if(valid15){
if(data12.kind !== undefined){
let data15 = data12.kind;
const _errs59 = errors;
if(typeof data15 !== "string"){
const err42 = {instancePath:instancePath+"/scope/kind",schemaPath:"#/definitions/Context/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
if("voyage" !== data15){
const err43 = {instancePath:instancePath+"/scope/kind",schemaPath:"#/definitions/Context/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
var valid15 = _errs59 === errors;
}
else {
var valid15 = true;
}
}
}
}
}
else {
const err44 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
}
var _valid2 = _errs54 === errors;
if(_valid2 && valid13){
valid13 = false;
passing2 = [passing2, 1];
}
else {
if(_valid2){
valid13 = true;
passing2 = 1;
}
const _errs61 = errors;
if(errors === _errs61){
if(data12 && typeof data12 == "object" && !Array.isArray(data12)){
let missing9;
if(((data12.kind === undefined) && (missing9 = "kind")) || ((data12.id === undefined) && (missing9 = "id"))){
const err45 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf/2/required",keyword:"required",params:{missingProperty: missing9},message:"must have required property '"+missing9+"'"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
else {
const _errs63 = errors;
for(const key9 in data12){
if(!((key9 === "id") || (key9 === "kind"))){
const err46 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key9},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
break;
}
}
if(_errs63 === errors){
if(data12.id !== undefined){
const _errs64 = errors;
if(typeof data12.id !== "string"){
const err47 = {instancePath:instancePath+"/scope/id",schemaPath:"#/definitions/Context/oneOf/2/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
var valid16 = _errs64 === errors;
}
else {
var valid16 = true;
}
if(valid16){
if(data12.kind !== undefined){
let data17 = data12.kind;
const _errs66 = errors;
if(typeof data17 !== "string"){
const err48 = {instancePath:instancePath+"/scope/kind",schemaPath:"#/definitions/Context/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
if("fleet" !== data17){
const err49 = {instancePath:instancePath+"/scope/kind",schemaPath:"#/definitions/Context/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
var valid16 = _errs66 === errors;
}
else {
var valid16 = true;
}
}
}
}
}
else {
const err50 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
var _valid2 = _errs61 === errors;
if(_valid2 && valid13){
valid13 = false;
passing2 = [passing2, 2];
}
else {
if(_valid2){
valid13 = true;
passing2 = 2;
}
const _errs68 = errors;
if(errors === _errs68){
if(data12 && typeof data12 == "object" && !Array.isArray(data12)){
let missing10;
if(((data12.kind === undefined) && (missing10 = "kind")) || ((data12.id === undefined) && (missing10 = "id"))){
const err51 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf/3/required",keyword:"required",params:{missingProperty: missing10},message:"must have required property '"+missing10+"'"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
else {
const _errs70 = errors;
for(const key10 in data12){
if(!((key10 === "id") || (key10 === "kind"))){
const err52 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key10},message:"must NOT have additional properties"};
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
if(_errs70 === errors){
if(data12.id !== undefined){
const _errs71 = errors;
if(typeof data12.id !== "string"){
const err53 = {instancePath:instancePath+"/scope/id",schemaPath:"#/definitions/Context/oneOf/3/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
var valid17 = _errs71 === errors;
}
else {
var valid17 = true;
}
if(valid17){
if(data12.kind !== undefined){
let data19 = data12.kind;
const _errs73 = errors;
if(typeof data19 !== "string"){
const err54 = {instancePath:instancePath+"/scope/kind",schemaPath:"#/definitions/Context/oneOf/3/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
if("vessel" !== data19){
const err55 = {instancePath:instancePath+"/scope/kind",schemaPath:"#/definitions/Context/oneOf/3/properties/kind/const",keyword:"const",params:{allowedValue: "vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
var valid17 = _errs73 === errors;
}
else {
var valid17 = true;
}
}
}
}
}
else {
const err56 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
}
var _valid2 = _errs68 === errors;
if(_valid2 && valid13){
valid13 = false;
passing2 = [passing2, 3];
}
else {
if(_valid2){
valid13 = true;
passing2 = 3;
}
const _errs75 = errors;
if(errors === _errs75){
if(data12 && typeof data12 == "object" && !Array.isArray(data12)){
let missing11;
if(((data12.kind === undefined) && (missing11 = "kind")) || ((data12.id === undefined) && (missing11 = "id"))){
const err57 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf/4/required",keyword:"required",params:{missingProperty: missing11},message:"must have required property '"+missing11+"'"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
else {
const _errs77 = errors;
for(const key11 in data12){
if(!((key11 === "id") || (key11 === "kind"))){
const err58 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key11},message:"must NOT have additional properties"};
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
if(_errs77 === errors){
if(data12.id !== undefined){
const _errs78 = errors;
if(typeof data12.id !== "string"){
const err59 = {instancePath:instancePath+"/scope/id",schemaPath:"#/definitions/Context/oneOf/4/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
var valid18 = _errs78 === errors;
}
else {
var valid18 = true;
}
if(valid18){
if(data12.kind !== undefined){
let data21 = data12.kind;
const _errs80 = errors;
if(typeof data21 !== "string"){
const err60 = {instancePath:instancePath+"/scope/kind",schemaPath:"#/definitions/Context/oneOf/4/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
if("portal" !== data21){
const err61 = {instancePath:instancePath+"/scope/kind",schemaPath:"#/definitions/Context/oneOf/4/properties/kind/const",keyword:"const",params:{allowedValue: "portal"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
var valid18 = _errs80 === errors;
}
else {
var valid18 = true;
}
}
}
}
}
else {
const err62 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
}
var _valid2 = _errs75 === errors;
if(_valid2 && valid13){
valid13 = false;
passing2 = [passing2, 4];
}
else {
if(_valid2){
valid13 = true;
passing2 = 4;
}
}
}
}
}
if(!valid13){
const err63 = {instancePath:instancePath+"/scope",schemaPath:"#/definitions/Context/oneOf",keyword:"oneOf",params:{passingSchemas: passing2},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
validate24.errors = vErrors;
return false;
}
else {
errors = _errs48;
if(vErrors !== null){
if(_errs48){
vErrors.length = _errs48;
}
else {
vErrors = null;
}
}
}
var valid0 = _errs46 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.version !== undefined){
const _errs82 = errors;
if(typeof data.version !== "string"){
validate24.errors = [{instancePath:instancePath+"/version",schemaPath:"#/properties/version/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs82 === errors;
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
validate24.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate24.errors = vErrors;
return errors === 0;
}

export const conversationReply = validate25;
const schema49 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"definitions":{"Delivery":{"enum":["accepted","rejected","unconfirmed"],"type":"string"}},"properties":{"delivery":{"$ref":"#/definitions/Delivery"},"error":{"type":["string","null"]},"requestId":{"type":"string"}},"required":["requestId","delivery"],"title":"Reply","type":"object"};
const schema50 = {"enum":["accepted","rejected","unconfirmed"],"type":"string"};

function validate25(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((data.requestId === undefined) && (missing0 = "requestId")) || ((data.delivery === undefined) && (missing0 = "delivery"))){
validate25.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(((key0 === "delivery") || (key0 === "error")) || (key0 === "requestId"))){
validate25.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.delivery !== undefined){
let data0 = data.delivery;
const _errs2 = errors;
if(typeof data0 !== "string"){
validate25.errors = [{instancePath:instancePath+"/delivery",schemaPath:"#/definitions/Delivery/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!(((data0 === "accepted") || (data0 === "rejected")) || (data0 === "unconfirmed"))){
validate25.errors = [{instancePath:instancePath+"/delivery",schemaPath:"#/definitions/Delivery/enum",keyword:"enum",params:{allowedValues: schema50.enum},message:"must be equal to one of the allowed values"}];
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
validate25.errors = [{instancePath:instancePath+"/error",schemaPath:"#/properties/error/type",keyword:"type",params:{type: schema49.properties.error.type},message:"must be string,null"}];
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
validate25.errors = [{instancePath:instancePath+"/requestId",schemaPath:"#/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate25.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate25.errors = vErrors;
return errors === 0;
}

export const conversationRequest = validate26;
const schema51 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"definitions":{"Action":{"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"send","type":"string"},"text":{"type":"string"}},"required":["operation","text"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"interrupt","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"start-voice","type":"string"}},"required":["operation"],"type":"object"}]}},"properties":{"action":{"$ref":"#/definitions/Action"},"requestId":{"type":"string"}},"required":["requestId","action"],"title":"Request","type":"object"};
const schema52 = {"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"send","type":"string"},"text":{"type":"string"}},"required":["operation","text"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"interrupt","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"start-voice","type":"string"}},"required":["operation"],"type":"object"}]};

function validate26(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((data.requestId === undefined) && (missing0 = "requestId")) || ((data.action === undefined) && (missing0 = "action"))){
validate26.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((key0 === "action") || (key0 === "requestId"))){
validate26.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
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
const _errs17 = errors;
if(errors === _errs17){
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
let missing3;
if((data0.operation === undefined) && (missing3 = "operation")){
const err11 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/Action/oneOf/2/required",keyword:"required",params:{missingProperty: missing3},message:"must have required property '"+missing3+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
else {
const _errs19 = errors;
for(const key3 in data0){
if(!(key3 === "operation")){
const err12 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/Action/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
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
if(_errs19 === errors){
if(data0.operation !== undefined){
let data4 = data0.operation;
if(typeof data4 !== "string"){
const err13 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/Action/oneOf/2/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if("start-voice" !== data4){
const err14 = {instancePath:instancePath+"/action/operation",schemaPath:"#/definitions/Action/oneOf/2/properties/operation/const",keyword:"const",params:{allowedValue: "start-voice"},message:"must be equal to constant"};
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
}
else {
const err15 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/Action/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
var _valid0 = _errs17 === errors;
if(_valid0 && valid2){
valid2 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid2 = true;
passing0 = 2;
}
}
}
if(!valid2){
const err16 = {instancePath:instancePath+"/action",schemaPath:"#/definitions/Action/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
validate26.errors = vErrors;
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
const _errs22 = errors;
if(typeof data.requestId !== "string"){
validate26.errors = [{instancePath:instancePath+"/requestId",schemaPath:"#/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs22 === errors;
}
else {
var valid0 = true;
}
}
}
}
}
else {
validate26.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate26.errors = vErrors;
return errors === 0;
}

export const conversationSnapshot = validate27;
const schema53 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"definitions":{"Action":{"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"inspect","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"home","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"canvas":{"$ref":"#/definitions/Canvas"},"operation":{"const":"update-canvas","type":"string"}},"required":["operation","canvas"],"type":"object"},{"additionalProperties":false,"properties":{"collapsed":{"type":"boolean"},"operation":{"const":"set-sidebar","type":"string"}},"required":["operation","collapsed"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"name":{"type":"string"},"operation":{"const":"save-layout","type":"string"}},"required":["operation","fleet","name"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"name":{"type":"string"},"operation":{"const":"load-layout","type":"string"}},"required":["operation","fleet","name"],"type":"object"},{"additionalProperties":false,"properties":{"cwd":{"type":"string"},"name":{"type":"string"},"operation":{"const":"create-voyage","type":"string"}},"required":["operation","name","cwd"],"type":"object"},{"additionalProperties":false,"properties":{"name":{"type":"string"},"operation":{"const":"create-fleet","type":"string"},"voyage":{"type":"string"}},"required":["operation","voyage","name"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"create-portal","type":"string"},"voyage":{"type":"string"}},"required":["operation","voyage"],"type":"object"},{"additionalProperties":false,"properties":{"destination":{"$ref":"#/definitions/ContentDestination"},"launch":{"anyOf":[{"$ref":"#/definitions/Launch"},{"type":"null"}]},"operation":{"const":"create-content","type":"string"},"typeId":{"type":"string"}},"required":["operation","typeId","destination"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"remove-content-package","type":"string"},"typeId":{"type":"string"}},"required":["operation","typeId"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"restore-content-package","type":"string"},"typeId":{"type":"string"}},"required":["operation","typeId"],"type":"object"},{"additionalProperties":false,"properties":{"name":{"type":"string"},"operation":{"const":"rename","type":"string"},"target":{"$ref":"#/definitions/RenameTarget"}},"required":["operation","target","name"],"type":"object"},{"additionalProperties":false,"properties":{"after":{"type":"string"},"axis":{"$ref":"#/definitions/Axis"},"fleet":{"type":"string"},"operation":{"const":"split","type":"string"}},"required":["operation","fleet","after","axis"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"operation":{"const":"resize-split","type":"string"},"path":{"items":{"$ref":"#/definitions/SplitChild"},"maxItems":128,"type":"array"},"share":{"$ref":"#/definitions/SplitShare"}},"required":["operation","fleet","path","share"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"move-vessel","type":"string"},"side":{"$ref":"#/definitions/Side"},"target":{"type":"string"}},"required":["operation","id","target","side"],"type":"object"},{"additionalProperties":false,"properties":{"before":{"type":"boolean"},"id":{"type":"string"},"operation":{"const":"move-voyage","type":"string"},"target":{"type":"string"}},"required":["operation","id","target","before"],"type":"object"},{"additionalProperties":false,"properties":{"before":{"type":"boolean"},"id":{"type":"string"},"operation":{"const":"move-fleet","type":"string"},"target":{"type":"string"}},"required":["operation","id","target","before"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"select-voyage","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"select-fleet","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"reveal-vessel","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"context":{"$ref":"#/definitions/Context"},"operation":{"const":"dock","type":"string"}},"required":["operation","context"],"type":"object"}]},"Axis":{"enum":["horizontal","vertical"],"type":"string"},"CallbackId":{"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"string","type":"string"},"value":{"type":"string"}},"required":["kind","value"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"integer","type":"string"},"value":{"pattern":"^-?[0-9]+$","type":"string"}},"required":["kind","value"],"type":"object"}]},"Canvas":{"additionalProperties":false,"properties":{"portalMode":{"allOf":[{"$ref":"#/definitions/PortalMode"}],"default":"overlay"},"root":{"$ref":"#/definitions/Node"},"sidebarCollapsed":{"default":false,"type":"boolean"}},"required":["root"],"type":"object"},"ContentDestination":{"oneOf":[{"additionalProperties":false,"properties":{"after":{"type":"string"},"axis":{"$ref":"#/definitions/Axis"},"fleet":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","fleet","after","axis"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"portal","type":"string"},"voyage":{"type":"string"}},"required":["kind","voyage"],"type":"object"}]},"Context":{"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"workspace","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]},"Effort":{"enum":["low","medium","high","xhigh","max","ultra"],"type":"string"},"Focus":{"additionalProperties":false,"properties":{"cwd":{"type":["string","null"]},"path":{"items":{"type":"string"},"type":"array"},"revision":{"type":"string"},"scope":{"$ref":"#/definitions/Context"}},"required":["scope","path","revision"],"type":"object"},"Launch":{"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"terminal","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"effort":{"allOf":[{"$ref":"#/definitions/Effort"}],"default":"high"},"kind":{"const":"codex","type":"string"},"model":{"default":"gpt-6.1-sol","type":"string"},"permissions":{"allOf":[{"$ref":"#/definitions/Permissions"}],"default":"yolo"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"argv":{"items":{"type":"string"},"type":"array"},"kind":{"const":"program","type":"string"}},"required":["kind","argv"],"type":"object"}]},"Message":{"additionalProperties":false,"properties":{"context":{"anyOf":[{"$ref":"#/definitions/Focus"},{"type":"null"}]},"id":{"type":"string"},"requestId":{"type":"string"},"role":{"$ref":"#/definitions/Role"},"text":{"type":"string"},"tool":{"anyOf":[{"$ref":"#/definitions/ToolOutcome"},{"type":"null"}]}},"required":["id","requestId","role","text"],"type":"object"},"Node":{"oneOf":[{"additionalProperties":false,"properties":{"children":{"items":{"$ref":"#/definitions/Node"},"type":"array"},"kind":{"const":"row","type":"string"},"size":{"allOf":[{"$ref":"#/definitions/Size"}],"default":{"kind":"fill"}}},"required":["kind","children"],"type":"object"},{"additionalProperties":false,"properties":{"children":{"items":{"$ref":"#/definitions/Node"},"type":"array"},"kind":{"const":"column","type":"string"},"size":{"allOf":[{"$ref":"#/definitions/Size"}],"default":{"kind":"fill"}}},"required":["kind","children"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"block","type":"string"},"region":{"$ref":"#/definitions/Region"},"size":{"allOf":[{"$ref":"#/definitions/Size"}],"default":{"kind":"fill"}}},"required":["kind","region"],"type":"object"}]},"Permissions":{"enum":["yolo","workspace-write","read-only"],"type":"string"},"Phase":{"enum":["idle","starting","working","completed","interrupted","failed","unconfirmed"],"type":"string"},"PortalMode":{"enum":["overlay","make-room"],"type":"string"},"ProcessAction":{"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"list","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"lines":{"maximum":160,"minimum":0,"type":"integer"},"operation":{"const":"read","type":"string"},"terminalId":{"type":"string"}},"required":["operation","contentId","terminalId","lines"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"send","type":"string"},"pid":{"maximum":4294967295,"minimum":0,"type":"integer"},"terminalId":{"type":"string"},"text":{"type":"string"}},"required":["operation","contentId","terminalId","pid","text"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"interrupt","type":"string"},"pid":{"maximum":4294967295,"minimum":0,"type":"integer"},"terminalId":{"type":"string"}},"required":["operation","contentId","terminalId","pid"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"stop","type":"string"},"pid":{"maximum":4294967295,"minimum":0,"type":"integer"},"terminalId":{"type":"string"}},"required":["operation","contentId","terminalId","pid"],"type":"object"}]},"Receipt":{"oneOf":[{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"describe","type":"string"}},"required":["operation","contentId"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"inspect","type":"string"}},"required":["operation","contentId"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"expectedRevision":{"type":"string"},"operation":{"const":"update","type":"string"}},"required":["operation","contentId","expectedRevision"],"type":"object"}]},"Region":{"enum":["sidebar","fleet-strip","active-fleet","portals","context-bar"],"type":"string"},"RenameTarget":{"oneOf":[{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]},"Role":{"enum":["user","assistant","tool"],"type":"string"},"Side":{"enum":["left","right","top","bottom"],"type":"string"},"Size":{"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"fill","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"content","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"fixed","type":"string"},"pixels":{"maximum":4096,"minimum":1,"type":"integer"}},"required":["kind","pixels"],"type":"object"}]},"SplitChild":{"enum":["first","second"],"type":"string"},"SplitShare":{"maximum":9999,"minimum":1,"type":"integer"},"Status":{"enum":["applied","rejected","uncertain"],"type":"string"},"ToolAction":{"oneOf":[{"additionalProperties":false,"properties":{"action":{"$ref":"#/definitions/Action"},"tool":{"const":"workspace","type":"string"}},"required":["tool","action"],"type":"object"},{"additionalProperties":false,"properties":{"action":{"$ref":"#/definitions/ProcessAction"},"tool":{"const":"process","type":"string"}},"required":["tool","action"],"type":"object"},{"additionalProperties":false,"properties":{"action":{"$ref":"#/definitions/Receipt"},"tool":{"const":"content","type":"string"}},"required":["tool","action"],"type":"object"}]},"ToolOutcome":{"additionalProperties":false,"properties":{"action":{"$ref":"#/definitions/ToolAction"},"callId":{"type":"string"},"callbackIds":{"items":{"$ref":"#/definitions/CallbackId"},"type":"array"},"name":{"type":"string"},"requestId":{"type":"string"},"status":{"$ref":"#/definitions/Status"},"version":{"type":["string","null"]}},"required":["name","callId","callbackIds","requestId","action","status"],"type":"object"}},"properties":{"error":{"type":["string","null"]},"limited":{"type":"boolean"},"messages":{"items":{"$ref":"#/definitions/Message"},"type":"array"},"model":{"type":["string","null"]},"omitted":{"type":"string"},"phase":{"$ref":"#/definitions/Phase"},"thread":{"type":["string","null"]},"turn":{"type":["string","null"]},"version":{"type":"string"}},"required":["version","phase","messages","limited","omitted"],"title":"Snapshot","type":"object"};
const schema83 = {"enum":["idle","starting","working","completed","interrupted","failed","unconfirmed"],"type":"string"};
const schema54 = {"additionalProperties":false,"properties":{"context":{"anyOf":[{"$ref":"#/definitions/Focus"},{"type":"null"}]},"id":{"type":"string"},"requestId":{"type":"string"},"role":{"$ref":"#/definitions/Role"},"text":{"type":"string"},"tool":{"anyOf":[{"$ref":"#/definitions/ToolOutcome"},{"type":"null"}]}},"required":["id","requestId","role","text"],"type":"object"};
const schema57 = {"enum":["user","assistant","tool"],"type":"string"};
const schema55 = {"additionalProperties":false,"properties":{"cwd":{"type":["string","null"]},"path":{"items":{"type":"string"},"type":"array"},"revision":{"type":"string"},"scope":{"$ref":"#/definitions/Context"}},"required":["scope","path","revision"],"type":"object"};
const schema56 = {"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"workspace","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]};

function validate29(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((((data.scope === undefined) && (missing0 = "scope")) || ((data.path === undefined) && (missing0 = "path"))) || ((data.revision === undefined) && (missing0 = "revision"))){
validate29.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((((key0 === "cwd") || (key0 === "path")) || (key0 === "revision")) || (key0 === "scope"))){
validate29.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.cwd !== undefined){
let data0 = data.cwd;
const _errs2 = errors;
if((typeof data0 !== "string") && (data0 !== null)){
validate29.errors = [{instancePath:instancePath+"/cwd",schemaPath:"#/properties/cwd/type",keyword:"type",params:{type: schema55.properties.cwd.type},message:"must be string,null"}];
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
validate29.errors = [{instancePath:instancePath+"/path/" + i0,schemaPath:"#/properties/path/items/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid1 = _errs6 === errors;
if(!valid1){
break;
}
}
}
else {
validate29.errors = [{instancePath:instancePath+"/path",schemaPath:"#/properties/path/type",keyword:"type",params:{type: "array"},message:"must be array"}];
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
validate29.errors = [{instancePath:instancePath+"/revision",schemaPath:"#/properties/revision/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate29.errors = vErrors;
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
validate29.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate29.errors = vErrors;
return errors === 0;
}

const schema58 = {"additionalProperties":false,"properties":{"action":{"$ref":"#/definitions/ToolAction"},"callId":{"type":"string"},"callbackIds":{"items":{"$ref":"#/definitions/CallbackId"},"type":"array"},"name":{"type":"string"},"requestId":{"type":"string"},"status":{"$ref":"#/definitions/Status"},"version":{"type":["string","null"]}},"required":["name","callId","callbackIds","requestId","action","status"],"type":"object"};
const schema81 = {"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"string","type":"string"},"value":{"type":"string"}},"required":["kind","value"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"integer","type":"string"},"value":{"pattern":"^-?[0-9]+$","type":"string"}},"required":["kind","value"],"type":"object"}]};
const schema82 = {"enum":["applied","rejected","uncertain"],"type":"string"};
const schema59 = {"oneOf":[{"additionalProperties":false,"properties":{"action":{"$ref":"#/definitions/Action"},"tool":{"const":"workspace","type":"string"}},"required":["tool","action"],"type":"object"},{"additionalProperties":false,"properties":{"action":{"$ref":"#/definitions/ProcessAction"},"tool":{"const":"process","type":"string"}},"required":["tool","action"],"type":"object"},{"additionalProperties":false,"properties":{"action":{"$ref":"#/definitions/Receipt"},"tool":{"const":"content","type":"string"}},"required":["tool","action"],"type":"object"}]};
const schema79 = {"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"list","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"lines":{"maximum":160,"minimum":0,"type":"integer"},"operation":{"const":"read","type":"string"},"terminalId":{"type":"string"}},"required":["operation","contentId","terminalId","lines"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"send","type":"string"},"pid":{"maximum":4294967295,"minimum":0,"type":"integer"},"terminalId":{"type":"string"},"text":{"type":"string"}},"required":["operation","contentId","terminalId","pid","text"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"interrupt","type":"string"},"pid":{"maximum":4294967295,"minimum":0,"type":"integer"},"terminalId":{"type":"string"}},"required":["operation","contentId","terminalId","pid"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"stop","type":"string"},"pid":{"maximum":4294967295,"minimum":0,"type":"integer"},"terminalId":{"type":"string"}},"required":["operation","contentId","terminalId","pid"],"type":"object"}]};
const schema80 = {"oneOf":[{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"describe","type":"string"}},"required":["operation","contentId"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"inspect","type":"string"}},"required":["operation","contentId"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"expectedRevision":{"type":"string"},"operation":{"const":"update","type":"string"}},"required":["operation","contentId","expectedRevision"],"type":"object"}]};
const schema60 = {"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"inspect","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"home","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"canvas":{"$ref":"#/definitions/Canvas"},"operation":{"const":"update-canvas","type":"string"}},"required":["operation","canvas"],"type":"object"},{"additionalProperties":false,"properties":{"collapsed":{"type":"boolean"},"operation":{"const":"set-sidebar","type":"string"}},"required":["operation","collapsed"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"name":{"type":"string"},"operation":{"const":"save-layout","type":"string"}},"required":["operation","fleet","name"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"name":{"type":"string"},"operation":{"const":"load-layout","type":"string"}},"required":["operation","fleet","name"],"type":"object"},{"additionalProperties":false,"properties":{"cwd":{"type":"string"},"name":{"type":"string"},"operation":{"const":"create-voyage","type":"string"}},"required":["operation","name","cwd"],"type":"object"},{"additionalProperties":false,"properties":{"name":{"type":"string"},"operation":{"const":"create-fleet","type":"string"},"voyage":{"type":"string"}},"required":["operation","voyage","name"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"create-portal","type":"string"},"voyage":{"type":"string"}},"required":["operation","voyage"],"type":"object"},{"additionalProperties":false,"properties":{"destination":{"$ref":"#/definitions/ContentDestination"},"launch":{"anyOf":[{"$ref":"#/definitions/Launch"},{"type":"null"}]},"operation":{"const":"create-content","type":"string"},"typeId":{"type":"string"}},"required":["operation","typeId","destination"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"remove-content-package","type":"string"},"typeId":{"type":"string"}},"required":["operation","typeId"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"restore-content-package","type":"string"},"typeId":{"type":"string"}},"required":["operation","typeId"],"type":"object"},{"additionalProperties":false,"properties":{"name":{"type":"string"},"operation":{"const":"rename","type":"string"},"target":{"$ref":"#/definitions/RenameTarget"}},"required":["operation","target","name"],"type":"object"},{"additionalProperties":false,"properties":{"after":{"type":"string"},"axis":{"$ref":"#/definitions/Axis"},"fleet":{"type":"string"},"operation":{"const":"split","type":"string"}},"required":["operation","fleet","after","axis"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"operation":{"const":"resize-split","type":"string"},"path":{"items":{"$ref":"#/definitions/SplitChild"},"maxItems":128,"type":"array"},"share":{"$ref":"#/definitions/SplitShare"}},"required":["operation","fleet","path","share"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"move-vessel","type":"string"},"side":{"$ref":"#/definitions/Side"},"target":{"type":"string"}},"required":["operation","id","target","side"],"type":"object"},{"additionalProperties":false,"properties":{"before":{"type":"boolean"},"id":{"type":"string"},"operation":{"const":"move-voyage","type":"string"},"target":{"type":"string"}},"required":["operation","id","target","before"],"type":"object"},{"additionalProperties":false,"properties":{"before":{"type":"boolean"},"id":{"type":"string"},"operation":{"const":"move-fleet","type":"string"},"target":{"type":"string"}},"required":["operation","id","target","before"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"select-voyage","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"select-fleet","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"reveal-vessel","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"context":{"$ref":"#/definitions/Context"},"operation":{"const":"dock","type":"string"}},"required":["operation","context"],"type":"object"}]};
const schema73 = {"oneOf":[{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]};
const schema69 = {"enum":["horizontal","vertical"],"type":"string"};
const schema75 = {"enum":["first","second"],"type":"string"};
const schema76 = {"maximum":9999,"minimum":1,"type":"integer"};
const schema77 = {"enum":["left","right","top","bottom"],"type":"string"};
const schema61 = {"additionalProperties":false,"properties":{"portalMode":{"allOf":[{"$ref":"#/definitions/PortalMode"}],"default":"overlay"},"root":{"$ref":"#/definitions/Node"},"sidebarCollapsed":{"default":false,"type":"boolean"}},"required":["root"],"type":"object"};
const schema62 = {"enum":["overlay","make-room"],"type":"string"};
const schema63 = {"oneOf":[{"additionalProperties":false,"properties":{"children":{"items":{"$ref":"#/definitions/Node"},"type":"array"},"kind":{"const":"row","type":"string"},"size":{"allOf":[{"$ref":"#/definitions/Size"}],"default":{"kind":"fill"}}},"required":["kind","children"],"type":"object"},{"additionalProperties":false,"properties":{"children":{"items":{"$ref":"#/definitions/Node"},"type":"array"},"kind":{"const":"column","type":"string"},"size":{"allOf":[{"$ref":"#/definitions/Size"}],"default":{"kind":"fill"}}},"required":["kind","children"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"block","type":"string"},"region":{"$ref":"#/definitions/Region"},"size":{"allOf":[{"$ref":"#/definitions/Size"}],"default":{"kind":"fill"}}},"required":["kind","region"],"type":"object"}]};
const schema64 = {"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"fill","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"content","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"fixed","type":"string"},"pixels":{"maximum":4096,"minimum":1,"type":"integer"}},"required":["kind","pixels"],"type":"object"}]};
const schema66 = {"enum":["sidebar","fleet-strip","active-fleet","portals","context-bar"],"type":"string"};
const wrapper2 = {validate: validate35};

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
if(((data.kind === undefined) && (missing0 = "kind")) || ((data.children === undefined) && (missing0 = "children"))){
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
if(!(((key0 === "children") || (key0 === "kind")) || (key0 === "size"))){
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
if(data.children !== undefined){
let data0 = data.children;
const _errs4 = errors;
if(errors === _errs4){
if(Array.isArray(data0)){
var valid2 = true;
const len0 = data0.length;
for(let i0=0; i0<len0; i0++){
const _errs6 = errors;
if(!(wrapper2.validate(data0[i0], {instancePath:instancePath+"/children/" + i0,parentData:data0,parentDataProperty:i0,rootData}))){
vErrors = vErrors === null ? wrapper2.validate.errors : vErrors.concat(wrapper2.validate.errors);
errors = vErrors.length;
}
var valid2 = _errs6 === errors;
if(!valid2){
break;
}
}
}
else {
const err2 = {instancePath:instancePath+"/children",schemaPath:"#/oneOf/0/properties/children/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
var valid1 = _errs4 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.kind !== undefined){
let data2 = data.kind;
const _errs7 = errors;
if(typeof data2 !== "string"){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if("row" !== data2){
const err4 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "row"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
var valid1 = _errs7 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.size !== undefined){
let data3 = data.size;
const _errs9 = errors;
const _errs12 = errors;
let valid5 = false;
let passing1 = null;
const _errs13 = errors;
if(errors === _errs13){
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
let missing1;
if((data3.kind === undefined) && (missing1 = "kind")){
const err5 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
else {
const _errs15 = errors;
for(const key1 in data3){
if(!(key1 === "kind")){
const err6 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
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
if(_errs15 === errors){
if(data3.kind !== undefined){
let data4 = data3.kind;
if(typeof data4 !== "string"){
const err7 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if("fill" !== data4){
const err8 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "fill"},message:"must be equal to constant"};
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
const err9 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
var _valid1 = _errs13 === errors;
if(_valid1){
valid5 = true;
passing1 = 0;
}
const _errs18 = errors;
if(errors === _errs18){
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
let missing2;
if((data3.kind === undefined) && (missing2 = "kind")){
const err10 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
else {
const _errs20 = errors;
for(const key2 in data3){
if(!(key2 === "kind")){
const err11 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
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
if(_errs20 === errors){
if(data3.kind !== undefined){
let data5 = data3.kind;
if(typeof data5 !== "string"){
const err12 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if("content" !== data5){
const err13 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "content"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
}
}
else {
const err14 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
var _valid1 = _errs18 === errors;
if(_valid1 && valid5){
valid5 = false;
passing1 = [passing1, 1];
}
else {
if(_valid1){
valid5 = true;
passing1 = 1;
}
const _errs23 = errors;
if(errors === _errs23){
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
let missing3;
if(((data3.kind === undefined) && (missing3 = "kind")) || ((data3.pixels === undefined) && (missing3 = "pixels"))){
const err15 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/required",keyword:"required",params:{missingProperty: missing3},message:"must have required property '"+missing3+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
else {
const _errs25 = errors;
for(const key3 in data3){
if(!((key3 === "kind") || (key3 === "pixels"))){
const err16 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
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
if(_errs25 === errors){
if(data3.kind !== undefined){
let data6 = data3.kind;
const _errs26 = errors;
if(typeof data6 !== "string"){
const err17 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if("fixed" !== data6){
const err18 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "fixed"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
var valid8 = _errs26 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data3.pixels !== undefined){
let data7 = data3.pixels;
const _errs28 = errors;
if(!(((typeof data7 == "number") && (!(data7 % 1) && !isNaN(data7))) && (isFinite(data7)))){
const err19 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(errors === _errs28){
if((typeof data7 == "number") && (isFinite(data7))){
if(data7 > 4096 || isNaN(data7)){
const err20 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/maximum",keyword:"maximum",params:{comparison: "<=", limit: 4096},message:"must be <= 4096"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
else {
if(data7 < 1 || isNaN(data7)){
const err21 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
}
}
var valid8 = _errs28 === errors;
}
else {
var valid8 = true;
}
}
}
}
}
else {
const err22 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
var _valid1 = _errs23 === errors;
if(_valid1 && valid5){
valid5 = false;
passing1 = [passing1, 2];
}
else {
if(_valid1){
valid5 = true;
passing1 = 2;
}
}
}
if(!valid5){
const err23 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf",keyword:"oneOf",params:{passingSchemas: passing1},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
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
var valid1 = _errs9 === errors;
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
const err24 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
}
const _errs30 = errors;
if(errors === _errs30){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing4;
if(((data.kind === undefined) && (missing4 = "kind")) || ((data.children === undefined) && (missing4 = "children"))){
const err25 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: missing4},message:"must have required property '"+missing4+"'"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
else {
const _errs32 = errors;
for(const key4 in data){
if(!(((key4 === "children") || (key4 === "kind")) || (key4 === "size"))){
const err26 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
break;
}
}
if(_errs32 === errors){
if(data.children !== undefined){
let data8 = data.children;
const _errs33 = errors;
if(errors === _errs33){
if(Array.isArray(data8)){
var valid10 = true;
const len1 = data8.length;
for(let i1=0; i1<len1; i1++){
const _errs35 = errors;
if(!(wrapper2.validate(data8[i1], {instancePath:instancePath+"/children/" + i1,parentData:data8,parentDataProperty:i1,rootData}))){
vErrors = vErrors === null ? wrapper2.validate.errors : vErrors.concat(wrapper2.validate.errors);
errors = vErrors.length;
}
var valid10 = _errs35 === errors;
if(!valid10){
break;
}
}
}
else {
const err27 = {instancePath:instancePath+"/children",schemaPath:"#/oneOf/1/properties/children/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
var valid9 = _errs33 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data.kind !== undefined){
let data10 = data.kind;
const _errs36 = errors;
if(typeof data10 !== "string"){
const err28 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if("column" !== data10){
const err29 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "column"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
var valid9 = _errs36 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data.size !== undefined){
let data11 = data.size;
const _errs38 = errors;
const _errs41 = errors;
let valid13 = false;
let passing2 = null;
const _errs42 = errors;
if(errors === _errs42){
if(data11 && typeof data11 == "object" && !Array.isArray(data11)){
let missing5;
if((data11.kind === undefined) && (missing5 = "kind")){
const err30 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/required",keyword:"required",params:{missingProperty: missing5},message:"must have required property '"+missing5+"'"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
else {
const _errs44 = errors;
for(const key5 in data11){
if(!(key5 === "kind")){
const err31 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
break;
}
}
if(_errs44 === errors){
if(data11.kind !== undefined){
let data12 = data11.kind;
if(typeof data12 !== "string"){
const err32 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
if("fill" !== data12){
const err33 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "fill"},message:"must be equal to constant"};
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
}
else {
const err34 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
var _valid2 = _errs42 === errors;
if(_valid2){
valid13 = true;
passing2 = 0;
}
const _errs47 = errors;
if(errors === _errs47){
if(data11 && typeof data11 == "object" && !Array.isArray(data11)){
let missing6;
if((data11.kind === undefined) && (missing6 = "kind")){
const err35 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/required",keyword:"required",params:{missingProperty: missing6},message:"must have required property '"+missing6+"'"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
else {
const _errs49 = errors;
for(const key6 in data11){
if(!(key6 === "kind")){
const err36 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
break;
}
}
if(_errs49 === errors){
if(data11.kind !== undefined){
let data13 = data11.kind;
if(typeof data13 !== "string"){
const err37 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
if("content" !== data13){
const err38 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "content"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
}
}
}
else {
const err39 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
var _valid2 = _errs47 === errors;
if(_valid2 && valid13){
valid13 = false;
passing2 = [passing2, 1];
}
else {
if(_valid2){
valid13 = true;
passing2 = 1;
}
const _errs52 = errors;
if(errors === _errs52){
if(data11 && typeof data11 == "object" && !Array.isArray(data11)){
let missing7;
if(((data11.kind === undefined) && (missing7 = "kind")) || ((data11.pixels === undefined) && (missing7 = "pixels"))){
const err40 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/required",keyword:"required",params:{missingProperty: missing7},message:"must have required property '"+missing7+"'"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
else {
const _errs54 = errors;
for(const key7 in data11){
if(!((key7 === "kind") || (key7 === "pixels"))){
const err41 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key7},message:"must NOT have additional properties"};
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
if(_errs54 === errors){
if(data11.kind !== undefined){
let data14 = data11.kind;
const _errs55 = errors;
if(typeof data14 !== "string"){
const err42 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
if("fixed" !== data14){
const err43 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "fixed"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
var valid16 = _errs55 === errors;
}
else {
var valid16 = true;
}
if(valid16){
if(data11.pixels !== undefined){
let data15 = data11.pixels;
const _errs57 = errors;
if(!(((typeof data15 == "number") && (!(data15 % 1) && !isNaN(data15))) && (isFinite(data15)))){
const err44 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
if(errors === _errs57){
if((typeof data15 == "number") && (isFinite(data15))){
if(data15 > 4096 || isNaN(data15)){
const err45 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/maximum",keyword:"maximum",params:{comparison: "<=", limit: 4096},message:"must be <= 4096"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
else {
if(data15 < 1 || isNaN(data15)){
const err46 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
}
}
var valid16 = _errs57 === errors;
}
else {
var valid16 = true;
}
}
}
}
}
else {
const err47 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
}
var _valid2 = _errs52 === errors;
if(_valid2 && valid13){
valid13 = false;
passing2 = [passing2, 2];
}
else {
if(_valid2){
valid13 = true;
passing2 = 2;
}
}
}
if(!valid13){
const err48 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf",keyword:"oneOf",params:{passingSchemas: passing2},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
else {
errors = _errs41;
if(vErrors !== null){
if(_errs41){
vErrors.length = _errs41;
}
else {
vErrors = null;
}
}
}
var valid9 = _errs38 === errors;
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
const err49 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
var _valid0 = _errs30 === errors;
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
let missing8;
if(((data.kind === undefined) && (missing8 = "kind")) || ((data.region === undefined) && (missing8 = "region"))){
const err50 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: missing8},message:"must have required property '"+missing8+"'"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
else {
const _errs61 = errors;
for(const key8 in data){
if(!(((key8 === "kind") || (key8 === "region")) || (key8 === "size"))){
const err51 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key8},message:"must NOT have additional properties"};
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
if(_errs61 === errors){
if(data.kind !== undefined){
let data16 = data.kind;
const _errs62 = errors;
if(typeof data16 !== "string"){
const err52 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
if("block" !== data16){
const err53 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "block"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
var valid17 = _errs62 === errors;
}
else {
var valid17 = true;
}
if(valid17){
if(data.region !== undefined){
let data17 = data.region;
const _errs64 = errors;
if(typeof data17 !== "string"){
const err54 = {instancePath:instancePath+"/region",schemaPath:"#/definitions/Region/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
if(!(((((data17 === "sidebar") || (data17 === "fleet-strip")) || (data17 === "active-fleet")) || (data17 === "portals")) || (data17 === "context-bar"))){
const err55 = {instancePath:instancePath+"/region",schemaPath:"#/definitions/Region/enum",keyword:"enum",params:{allowedValues: schema66.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
var valid17 = _errs64 === errors;
}
else {
var valid17 = true;
}
if(valid17){
if(data.size !== undefined){
let data18 = data.size;
const _errs67 = errors;
const _errs70 = errors;
let valid21 = false;
let passing3 = null;
const _errs71 = errors;
if(errors === _errs71){
if(data18 && typeof data18 == "object" && !Array.isArray(data18)){
let missing9;
if((data18.kind === undefined) && (missing9 = "kind")){
const err56 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/required",keyword:"required",params:{missingProperty: missing9},message:"must have required property '"+missing9+"'"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
else {
const _errs73 = errors;
for(const key9 in data18){
if(!(key9 === "kind")){
const err57 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key9},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
break;
}
}
if(_errs73 === errors){
if(data18.kind !== undefined){
let data19 = data18.kind;
if(typeof data19 !== "string"){
const err58 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
if("fill" !== data19){
const err59 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "fill"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
}
}
}
}
else {
const err60 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
var _valid3 = _errs71 === errors;
if(_valid3){
valid21 = true;
passing3 = 0;
}
const _errs76 = errors;
if(errors === _errs76){
if(data18 && typeof data18 == "object" && !Array.isArray(data18)){
let missing10;
if((data18.kind === undefined) && (missing10 = "kind")){
const err61 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/required",keyword:"required",params:{missingProperty: missing10},message:"must have required property '"+missing10+"'"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
else {
const _errs78 = errors;
for(const key10 in data18){
if(!(key10 === "kind")){
const err62 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key10},message:"must NOT have additional properties"};
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
if(_errs78 === errors){
if(data18.kind !== undefined){
let data20 = data18.kind;
if(typeof data20 !== "string"){
const err63 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
if("content" !== data20){
const err64 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "content"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
}
}
}
}
else {
const err65 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
}
var _valid3 = _errs76 === errors;
if(_valid3 && valid21){
valid21 = false;
passing3 = [passing3, 1];
}
else {
if(_valid3){
valid21 = true;
passing3 = 1;
}
const _errs81 = errors;
if(errors === _errs81){
if(data18 && typeof data18 == "object" && !Array.isArray(data18)){
let missing11;
if(((data18.kind === undefined) && (missing11 = "kind")) || ((data18.pixels === undefined) && (missing11 = "pixels"))){
const err66 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/required",keyword:"required",params:{missingProperty: missing11},message:"must have required property '"+missing11+"'"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
else {
const _errs83 = errors;
for(const key11 in data18){
if(!((key11 === "kind") || (key11 === "pixels"))){
const err67 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key11},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
break;
}
}
if(_errs83 === errors){
if(data18.kind !== undefined){
let data21 = data18.kind;
const _errs84 = errors;
if(typeof data21 !== "string"){
const err68 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
if("fixed" !== data21){
const err69 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "fixed"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
var valid24 = _errs84 === errors;
}
else {
var valid24 = true;
}
if(valid24){
if(data18.pixels !== undefined){
let data22 = data18.pixels;
const _errs86 = errors;
if(!(((typeof data22 == "number") && (!(data22 % 1) && !isNaN(data22))) && (isFinite(data22)))){
const err70 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
if(errors === _errs86){
if((typeof data22 == "number") && (isFinite(data22))){
if(data22 > 4096 || isNaN(data22)){
const err71 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/maximum",keyword:"maximum",params:{comparison: "<=", limit: 4096},message:"must be <= 4096"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
else {
if(data22 < 1 || isNaN(data22)){
const err72 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
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
var valid24 = _errs86 === errors;
}
else {
var valid24 = true;
}
}
}
}
}
else {
const err73 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
}
var _valid3 = _errs81 === errors;
if(_valid3 && valid21){
valid21 = false;
passing3 = [passing3, 2];
}
else {
if(_valid3){
valid21 = true;
passing3 = 2;
}
}
}
if(!valid21){
const err74 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf",keyword:"oneOf",params:{passingSchemas: passing3},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
else {
errors = _errs70;
if(vErrors !== null){
if(_errs70){
vErrors.length = _errs70;
}
else {
vErrors = null;
}
}
}
var valid17 = _errs67 === errors;
}
else {
var valid17 = true;
}
}
}
}
}
}
else {
const err75 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
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
}
}
if(!valid0){
const err76 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
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
if((data.root === undefined) && (missing0 = "root")){
validate34.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(((key0 === "portalMode") || (key0 === "root")) || (key0 === "sidebarCollapsed"))){
validate34.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.portalMode !== undefined){
let data0 = data.portalMode;
const _errs2 = errors;
if(typeof data0 !== "string"){
validate34.errors = [{instancePath:instancePath+"/portalMode",schemaPath:"#/definitions/PortalMode/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!((data0 === "overlay") || (data0 === "make-room"))){
validate34.errors = [{instancePath:instancePath+"/portalMode",schemaPath:"#/definitions/PortalMode/enum",keyword:"enum",params:{allowedValues: schema62.enum},message:"must be equal to one of the allowed values"}];
return false;
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.root !== undefined){
const _errs6 = errors;
if(!(validate35(data.root, {instancePath:instancePath+"/root",parentData:data,parentDataProperty:"root",rootData}))){
vErrors = vErrors === null ? validate35.errors : vErrors.concat(validate35.errors);
errors = vErrors.length;
}
var valid0 = _errs6 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.sidebarCollapsed !== undefined){
const _errs7 = errors;
if(typeof data.sidebarCollapsed !== "boolean"){
validate34.errors = [{instancePath:instancePath+"/sidebarCollapsed",schemaPath:"#/properties/sidebarCollapsed/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"}];
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
validate34.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate34.errors = vErrors;
return errors === 0;
}

const schema68 = {"oneOf":[{"additionalProperties":false,"properties":{"after":{"type":"string"},"axis":{"$ref":"#/definitions/Axis"},"fleet":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","fleet","after","axis"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"portal","type":"string"},"voyage":{"type":"string"}},"required":["kind","voyage"],"type":"object"}]};

function validate38(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
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
const err4 = {instancePath:instancePath+"/axis",schemaPath:"#/definitions/Axis/enum",keyword:"enum",params:{allowedValues: schema69.enum},message:"must be equal to one of the allowed values"};
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
validate38.errors = vErrors;
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
validate38.errors = vErrors;
return errors === 0;
}

const schema70 = {"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"terminal","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"effort":{"allOf":[{"$ref":"#/definitions/Effort"}],"default":"high"},"kind":{"const":"codex","type":"string"},"model":{"default":"gpt-6.1-sol","type":"string"},"permissions":{"allOf":[{"$ref":"#/definitions/Permissions"}],"default":"yolo"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"argv":{"items":{"type":"string"},"type":"array"},"kind":{"const":"program","type":"string"}},"required":["kind","argv"],"type":"object"}]};
const schema71 = {"enum":["low","medium","high","xhigh","max","ultra"],"type":"string"};
const schema72 = {"enum":["yolo","workspace-write","read-only"],"type":"string"};

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
if((data.kind === undefined) && (missing0 = "kind")){
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
if(!(key0 === "kind")){
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
if("terminal" !== data0){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "terminal"},message:"must be equal to constant"};
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
if((data.kind === undefined) && (missing1 = "kind")){
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
if(!((((key1 === "effort") || (key1 === "kind")) || (key1 === "model")) || (key1 === "permissions"))){
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
if(data.effort !== undefined){
let data1 = data.effort;
const _errs9 = errors;
if(typeof data1 !== "string"){
const err7 = {instancePath:instancePath+"/effort",schemaPath:"#/definitions/Effort/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(!((((((data1 === "low") || (data1 === "medium")) || (data1 === "high")) || (data1 === "xhigh")) || (data1 === "max")) || (data1 === "ultra"))){
const err8 = {instancePath:instancePath+"/effort",schemaPath:"#/definitions/Effort/enum",keyword:"enum",params:{allowedValues: schema71.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
var valid2 = _errs9 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data.kind !== undefined){
let data2 = data.kind;
const _errs13 = errors;
if(typeof data2 !== "string"){
const err9 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if("codex" !== data2){
const err10 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "codex"},message:"must be equal to constant"};
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
if(valid2){
if(data.model !== undefined){
const _errs15 = errors;
if(typeof data.model !== "string"){
const err11 = {instancePath:instancePath+"/model",schemaPath:"#/oneOf/1/properties/model/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
if(data.permissions !== undefined){
let data4 = data.permissions;
const _errs17 = errors;
if(typeof data4 !== "string"){
const err12 = {instancePath:instancePath+"/permissions",schemaPath:"#/definitions/Permissions/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(!(((data4 === "yolo") || (data4 === "workspace-write")) || (data4 === "read-only"))){
const err13 = {instancePath:instancePath+"/permissions",schemaPath:"#/definitions/Permissions/enum",keyword:"enum",params:{allowedValues: schema72.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
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
const _errs21 = errors;
if(errors === _errs21){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing2;
if(((data.kind === undefined) && (missing2 = "kind")) || ((data.argv === undefined) && (missing2 = "argv"))){
const err15 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"};
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
for(const key2 in data){
if(!((key2 === "argv") || (key2 === "kind"))){
const err16 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
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
if(data.argv !== undefined){
let data5 = data.argv;
const _errs24 = errors;
if(errors === _errs24){
if(Array.isArray(data5)){
var valid8 = true;
const len0 = data5.length;
for(let i0=0; i0<len0; i0++){
const _errs26 = errors;
if(typeof data5[i0] !== "string"){
const err17 = {instancePath:instancePath+"/argv/" + i0,schemaPath:"#/oneOf/2/properties/argv/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
var valid8 = _errs26 === errors;
if(!valid8){
break;
}
}
}
else {
const err18 = {instancePath:instancePath+"/argv",schemaPath:"#/oneOf/2/properties/argv/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
var valid7 = _errs24 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data.kind !== undefined){
let data7 = data.kind;
const _errs28 = errors;
if(typeof data7 !== "string"){
const err19 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if("program" !== data7){
const err20 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "program"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
var valid7 = _errs28 === errors;
}
else {
var valid7 = true;
}
}
}
}
}
else {
const err21 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
var _valid0 = _errs21 === errors;
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
const err22 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
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


function validate33(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
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
if(((data.operation === undefined) && (missing2 = "operation")) || ((data.canvas === undefined) && (missing2 = "canvas"))){
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
if(!((key2 === "canvas") || (key2 === "operation"))){
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
if(data.canvas !== undefined){
const _errs14 = errors;
if(!(validate34(data.canvas, {instancePath:instancePath+"/canvas",parentData:data,parentDataProperty:"canvas",rootData}))){
vErrors = vErrors === null ? validate34.errors : vErrors.concat(validate34.errors);
errors = vErrors.length;
}
var valid3 = _errs14 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data.operation !== undefined){
let data3 = data.operation;
const _errs15 = errors;
if(typeof data3 !== "string"){
const err12 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/2/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if("update-canvas" !== data3){
const err13 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/2/properties/operation/const",keyword:"const",params:{allowedValue: "update-canvas"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
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
const err14 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
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
const _errs17 = errors;
if(errors === _errs17){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing3;
if(((data.operation === undefined) && (missing3 = "operation")) || ((data.collapsed === undefined) && (missing3 = "collapsed"))){
const err15 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: missing3},message:"must have required property '"+missing3+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
else {
const _errs19 = errors;
for(const key3 in data){
if(!((key3 === "collapsed") || (key3 === "operation"))){
const err16 = {instancePath,schemaPath:"#/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
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
if(_errs19 === errors){
if(data.collapsed !== undefined){
const _errs20 = errors;
if(typeof data.collapsed !== "boolean"){
const err17 = {instancePath:instancePath+"/collapsed",schemaPath:"#/oneOf/3/properties/collapsed/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
var valid4 = _errs20 === errors;
}
else {
var valid4 = true;
}
if(valid4){
if(data.operation !== undefined){
let data5 = data.operation;
const _errs22 = errors;
if(typeof data5 !== "string"){
const err18 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/3/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if("set-sidebar" !== data5){
const err19 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/3/properties/operation/const",keyword:"const",params:{allowedValue: "set-sidebar"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
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
else {
const err20 = {instancePath,schemaPath:"#/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
var _valid0 = _errs17 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid0 = true;
passing0 = 3;
}
const _errs24 = errors;
if(errors === _errs24){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing4;
if((((data.operation === undefined) && (missing4 = "operation")) || ((data.fleet === undefined) && (missing4 = "fleet"))) || ((data.name === undefined) && (missing4 = "name"))){
const err21 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: missing4},message:"must have required property '"+missing4+"'"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
else {
const _errs26 = errors;
for(const key4 in data){
if(!(((key4 === "fleet") || (key4 === "name")) || (key4 === "operation"))){
const err22 = {instancePath,schemaPath:"#/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
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
if(_errs26 === errors){
if(data.fleet !== undefined){
const _errs27 = errors;
if(typeof data.fleet !== "string"){
const err23 = {instancePath:instancePath+"/fleet",schemaPath:"#/oneOf/4/properties/fleet/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
var valid5 = _errs27 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data.name !== undefined){
const _errs29 = errors;
if(typeof data.name !== "string"){
const err24 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/4/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
var valid5 = _errs29 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data.operation !== undefined){
let data8 = data.operation;
const _errs31 = errors;
if(typeof data8 !== "string"){
const err25 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/4/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if("save-layout" !== data8){
const err26 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/4/properties/operation/const",keyword:"const",params:{allowedValue: "save-layout"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
var valid5 = _errs31 === errors;
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
const err27 = {instancePath,schemaPath:"#/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
passing0 = [passing0, 4];
}
else {
if(_valid0){
valid0 = true;
passing0 = 4;
}
const _errs33 = errors;
if(errors === _errs33){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing5;
if((((data.operation === undefined) && (missing5 = "operation")) || ((data.fleet === undefined) && (missing5 = "fleet"))) || ((data.name === undefined) && (missing5 = "name"))){
const err28 = {instancePath,schemaPath:"#/oneOf/5/required",keyword:"required",params:{missingProperty: missing5},message:"must have required property '"+missing5+"'"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
else {
const _errs35 = errors;
for(const key5 in data){
if(!(((key5 === "fleet") || (key5 === "name")) || (key5 === "operation"))){
const err29 = {instancePath,schemaPath:"#/oneOf/5/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
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
if(_errs35 === errors){
if(data.fleet !== undefined){
const _errs36 = errors;
if(typeof data.fleet !== "string"){
const err30 = {instancePath:instancePath+"/fleet",schemaPath:"#/oneOf/5/properties/fleet/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
var valid6 = _errs36 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data.name !== undefined){
const _errs38 = errors;
if(typeof data.name !== "string"){
const err31 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/5/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
var valid6 = _errs38 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data.operation !== undefined){
let data11 = data.operation;
const _errs40 = errors;
if(typeof data11 !== "string"){
const err32 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/5/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
if("load-layout" !== data11){
const err33 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/5/properties/operation/const",keyword:"const",params:{allowedValue: "load-layout"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
var valid6 = _errs40 === errors;
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
const err34 = {instancePath,schemaPath:"#/oneOf/5/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
var _valid0 = _errs33 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 5];
}
else {
if(_valid0){
valid0 = true;
passing0 = 5;
}
const _errs42 = errors;
if(errors === _errs42){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing6;
if((((data.operation === undefined) && (missing6 = "operation")) || ((data.name === undefined) && (missing6 = "name"))) || ((data.cwd === undefined) && (missing6 = "cwd"))){
const err35 = {instancePath,schemaPath:"#/oneOf/6/required",keyword:"required",params:{missingProperty: missing6},message:"must have required property '"+missing6+"'"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
else {
const _errs44 = errors;
for(const key6 in data){
if(!(((key6 === "cwd") || (key6 === "name")) || (key6 === "operation"))){
const err36 = {instancePath,schemaPath:"#/oneOf/6/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
break;
}
}
if(_errs44 === errors){
if(data.cwd !== undefined){
const _errs45 = errors;
if(typeof data.cwd !== "string"){
const err37 = {instancePath:instancePath+"/cwd",schemaPath:"#/oneOf/6/properties/cwd/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
var valid7 = _errs45 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data.name !== undefined){
const _errs47 = errors;
if(typeof data.name !== "string"){
const err38 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/6/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
var valid7 = _errs47 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data.operation !== undefined){
let data14 = data.operation;
const _errs49 = errors;
if(typeof data14 !== "string"){
const err39 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/6/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
if("create-voyage" !== data14){
const err40 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/6/properties/operation/const",keyword:"const",params:{allowedValue: "create-voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
var valid7 = _errs49 === errors;
}
else {
var valid7 = true;
}
}
}
}
}
}
else {
const err41 = {instancePath,schemaPath:"#/oneOf/6/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
var _valid0 = _errs42 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 6];
}
else {
if(_valid0){
valid0 = true;
passing0 = 6;
}
const _errs51 = errors;
if(errors === _errs51){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing7;
if((((data.operation === undefined) && (missing7 = "operation")) || ((data.voyage === undefined) && (missing7 = "voyage"))) || ((data.name === undefined) && (missing7 = "name"))){
const err42 = {instancePath,schemaPath:"#/oneOf/7/required",keyword:"required",params:{missingProperty: missing7},message:"must have required property '"+missing7+"'"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
else {
const _errs53 = errors;
for(const key7 in data){
if(!(((key7 === "name") || (key7 === "operation")) || (key7 === "voyage"))){
const err43 = {instancePath,schemaPath:"#/oneOf/7/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key7},message:"must NOT have additional properties"};
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
if(_errs53 === errors){
if(data.name !== undefined){
const _errs54 = errors;
if(typeof data.name !== "string"){
const err44 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/7/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
var valid8 = _errs54 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data.operation !== undefined){
let data16 = data.operation;
const _errs56 = errors;
if(typeof data16 !== "string"){
const err45 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/7/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
if("create-fleet" !== data16){
const err46 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/7/properties/operation/const",keyword:"const",params:{allowedValue: "create-fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
var valid8 = _errs56 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data.voyage !== undefined){
const _errs58 = errors;
if(typeof data.voyage !== "string"){
const err47 = {instancePath:instancePath+"/voyage",schemaPath:"#/oneOf/7/properties/voyage/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
}
}
}
}
}
else {
const err48 = {instancePath,schemaPath:"#/oneOf/7/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
var _valid0 = _errs51 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 7];
}
else {
if(_valid0){
valid0 = true;
passing0 = 7;
}
const _errs60 = errors;
if(errors === _errs60){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing8;
if(((data.operation === undefined) && (missing8 = "operation")) || ((data.voyage === undefined) && (missing8 = "voyage"))){
const err49 = {instancePath,schemaPath:"#/oneOf/8/required",keyword:"required",params:{missingProperty: missing8},message:"must have required property '"+missing8+"'"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
else {
const _errs62 = errors;
for(const key8 in data){
if(!((key8 === "operation") || (key8 === "voyage"))){
const err50 = {instancePath,schemaPath:"#/oneOf/8/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key8},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
break;
}
}
if(_errs62 === errors){
if(data.operation !== undefined){
let data18 = data.operation;
const _errs63 = errors;
if(typeof data18 !== "string"){
const err51 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/8/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
if("create-portal" !== data18){
const err52 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/8/properties/operation/const",keyword:"const",params:{allowedValue: "create-portal"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
var valid9 = _errs63 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data.voyage !== undefined){
const _errs65 = errors;
if(typeof data.voyage !== "string"){
const err53 = {instancePath:instancePath+"/voyage",schemaPath:"#/oneOf/8/properties/voyage/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
var valid9 = _errs65 === errors;
}
else {
var valid9 = true;
}
}
}
}
}
else {
const err54 = {instancePath,schemaPath:"#/oneOf/8/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
}
var _valid0 = _errs60 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 8];
}
else {
if(_valid0){
valid0 = true;
passing0 = 8;
}
const _errs67 = errors;
if(errors === _errs67){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing9;
if((((data.operation === undefined) && (missing9 = "operation")) || ((data.typeId === undefined) && (missing9 = "typeId"))) || ((data.destination === undefined) && (missing9 = "destination"))){
const err55 = {instancePath,schemaPath:"#/oneOf/9/required",keyword:"required",params:{missingProperty: missing9},message:"must have required property '"+missing9+"'"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
else {
const _errs69 = errors;
for(const key9 in data){
if(!((((key9 === "destination") || (key9 === "launch")) || (key9 === "operation")) || (key9 === "typeId"))){
const err56 = {instancePath,schemaPath:"#/oneOf/9/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key9},message:"must NOT have additional properties"};
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
if(_errs69 === errors){
if(data.destination !== undefined){
const _errs70 = errors;
if(!(validate38(data.destination, {instancePath:instancePath+"/destination",parentData:data,parentDataProperty:"destination",rootData}))){
vErrors = vErrors === null ? validate38.errors : vErrors.concat(validate38.errors);
errors = vErrors.length;
}
var valid10 = _errs70 === errors;
}
else {
var valid10 = true;
}
if(valid10){
if(data.launch !== undefined){
let data21 = data.launch;
const _errs71 = errors;
const _errs72 = errors;
let valid11 = false;
const _errs73 = errors;
if(!(validate40(data21, {instancePath:instancePath+"/launch",parentData:data,parentDataProperty:"launch",rootData}))){
vErrors = vErrors === null ? validate40.errors : vErrors.concat(validate40.errors);
errors = vErrors.length;
}
var _valid1 = _errs73 === errors;
valid11 = valid11 || _valid1;
if(!valid11){
const _errs74 = errors;
if(data21 !== null){
const err57 = {instancePath:instancePath+"/launch",schemaPath:"#/oneOf/9/properties/launch/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
var _valid1 = _errs74 === errors;
valid11 = valid11 || _valid1;
}
if(!valid11){
const err58 = {instancePath:instancePath+"/launch",schemaPath:"#/oneOf/9/properties/launch/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
else {
errors = _errs72;
if(vErrors !== null){
if(_errs72){
vErrors.length = _errs72;
}
else {
vErrors = null;
}
}
}
var valid10 = _errs71 === errors;
}
else {
var valid10 = true;
}
if(valid10){
if(data.operation !== undefined){
let data22 = data.operation;
const _errs76 = errors;
if(typeof data22 !== "string"){
const err59 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/9/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
if("create-content" !== data22){
const err60 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/9/properties/operation/const",keyword:"const",params:{allowedValue: "create-content"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
var valid10 = _errs76 === errors;
}
else {
var valid10 = true;
}
if(valid10){
if(data.typeId !== undefined){
const _errs78 = errors;
if(typeof data.typeId !== "string"){
const err61 = {instancePath:instancePath+"/typeId",schemaPath:"#/oneOf/9/properties/typeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
var valid10 = _errs78 === errors;
}
else {
var valid10 = true;
}
}
}
}
}
}
}
else {
const err62 = {instancePath,schemaPath:"#/oneOf/9/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
}
var _valid0 = _errs67 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 9];
}
else {
if(_valid0){
valid0 = true;
passing0 = 9;
}
const _errs80 = errors;
if(errors === _errs80){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing10;
if(((data.operation === undefined) && (missing10 = "operation")) || ((data.typeId === undefined) && (missing10 = "typeId"))){
const err63 = {instancePath,schemaPath:"#/oneOf/10/required",keyword:"required",params:{missingProperty: missing10},message:"must have required property '"+missing10+"'"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
else {
const _errs82 = errors;
for(const key10 in data){
if(!((key10 === "operation") || (key10 === "typeId"))){
const err64 = {instancePath,schemaPath:"#/oneOf/10/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key10},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
break;
}
}
if(_errs82 === errors){
if(data.operation !== undefined){
let data24 = data.operation;
const _errs83 = errors;
if(typeof data24 !== "string"){
const err65 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/10/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
if("remove-content-package" !== data24){
const err66 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/10/properties/operation/const",keyword:"const",params:{allowedValue: "remove-content-package"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
var valid12 = _errs83 === errors;
}
else {
var valid12 = true;
}
if(valid12){
if(data.typeId !== undefined){
const _errs85 = errors;
if(typeof data.typeId !== "string"){
const err67 = {instancePath:instancePath+"/typeId",schemaPath:"#/oneOf/10/properties/typeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
var valid12 = _errs85 === errors;
}
else {
var valid12 = true;
}
}
}
}
}
else {
const err68 = {instancePath,schemaPath:"#/oneOf/10/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
}
var _valid0 = _errs80 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 10];
}
else {
if(_valid0){
valid0 = true;
passing0 = 10;
}
const _errs87 = errors;
if(errors === _errs87){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing11;
if(((data.operation === undefined) && (missing11 = "operation")) || ((data.typeId === undefined) && (missing11 = "typeId"))){
const err69 = {instancePath,schemaPath:"#/oneOf/11/required",keyword:"required",params:{missingProperty: missing11},message:"must have required property '"+missing11+"'"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
else {
const _errs89 = errors;
for(const key11 in data){
if(!((key11 === "operation") || (key11 === "typeId"))){
const err70 = {instancePath,schemaPath:"#/oneOf/11/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key11},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
break;
}
}
if(_errs89 === errors){
if(data.operation !== undefined){
let data26 = data.operation;
const _errs90 = errors;
if(typeof data26 !== "string"){
const err71 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/11/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
if("restore-content-package" !== data26){
const err72 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/11/properties/operation/const",keyword:"const",params:{allowedValue: "restore-content-package"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
var valid13 = _errs90 === errors;
}
else {
var valid13 = true;
}
if(valid13){
if(data.typeId !== undefined){
const _errs92 = errors;
if(typeof data.typeId !== "string"){
const err73 = {instancePath:instancePath+"/typeId",schemaPath:"#/oneOf/11/properties/typeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
var valid13 = _errs92 === errors;
}
else {
var valid13 = true;
}
}
}
}
}
else {
const err74 = {instancePath,schemaPath:"#/oneOf/11/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
}
var _valid0 = _errs87 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 11];
}
else {
if(_valid0){
valid0 = true;
passing0 = 11;
}
const _errs94 = errors;
if(errors === _errs94){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing12;
if((((data.operation === undefined) && (missing12 = "operation")) || ((data.target === undefined) && (missing12 = "target"))) || ((data.name === undefined) && (missing12 = "name"))){
const err75 = {instancePath,schemaPath:"#/oneOf/12/required",keyword:"required",params:{missingProperty: missing12},message:"must have required property '"+missing12+"'"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
else {
const _errs96 = errors;
for(const key12 in data){
if(!(((key12 === "name") || (key12 === "operation")) || (key12 === "target"))){
const err76 = {instancePath,schemaPath:"#/oneOf/12/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key12},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
break;
}
}
if(_errs96 === errors){
if(data.name !== undefined){
const _errs97 = errors;
if(typeof data.name !== "string"){
const err77 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/12/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
var valid14 = _errs97 === errors;
}
else {
var valid14 = true;
}
if(valid14){
if(data.operation !== undefined){
let data29 = data.operation;
const _errs99 = errors;
if(typeof data29 !== "string"){
const err78 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/12/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
if("rename" !== data29){
const err79 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/12/properties/operation/const",keyword:"const",params:{allowedValue: "rename"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
var valid14 = _errs99 === errors;
}
else {
var valid14 = true;
}
if(valid14){
if(data.target !== undefined){
let data30 = data.target;
const _errs101 = errors;
const _errs103 = errors;
let valid16 = false;
let passing1 = null;
const _errs104 = errors;
if(errors === _errs104){
if(data30 && typeof data30 == "object" && !Array.isArray(data30)){
let missing13;
if(((data30.kind === undefined) && (missing13 = "kind")) || ((data30.id === undefined) && (missing13 = "id"))){
const err80 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/0/required",keyword:"required",params:{missingProperty: missing13},message:"must have required property '"+missing13+"'"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
else {
const _errs106 = errors;
for(const key13 in data30){
if(!((key13 === "id") || (key13 === "kind"))){
const err81 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key13},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
break;
}
}
if(_errs106 === errors){
if(data30.id !== undefined){
const _errs107 = errors;
if(typeof data30.id !== "string"){
const err82 = {instancePath:instancePath+"/target/id",schemaPath:"#/definitions/RenameTarget/oneOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
var valid17 = _errs107 === errors;
}
else {
var valid17 = true;
}
if(valid17){
if(data30.kind !== undefined){
let data32 = data30.kind;
const _errs109 = errors;
if(typeof data32 !== "string"){
const err83 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
if("voyage" !== data32){
const err84 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
var valid17 = _errs109 === errors;
}
else {
var valid17 = true;
}
}
}
}
}
else {
const err85 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
}
var _valid2 = _errs104 === errors;
if(_valid2){
valid16 = true;
passing1 = 0;
}
const _errs111 = errors;
if(errors === _errs111){
if(data30 && typeof data30 == "object" && !Array.isArray(data30)){
let missing14;
if(((data30.kind === undefined) && (missing14 = "kind")) || ((data30.id === undefined) && (missing14 = "id"))){
const err86 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/1/required",keyword:"required",params:{missingProperty: missing14},message:"must have required property '"+missing14+"'"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
else {
const _errs113 = errors;
for(const key14 in data30){
if(!((key14 === "id") || (key14 === "kind"))){
const err87 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key14},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
break;
}
}
if(_errs113 === errors){
if(data30.id !== undefined){
const _errs114 = errors;
if(typeof data30.id !== "string"){
const err88 = {instancePath:instancePath+"/target/id",schemaPath:"#/definitions/RenameTarget/oneOf/1/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
var valid18 = _errs114 === errors;
}
else {
var valid18 = true;
}
if(valid18){
if(data30.kind !== undefined){
let data34 = data30.kind;
const _errs116 = errors;
if(typeof data34 !== "string"){
const err89 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
if("fleet" !== data34){
const err90 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
var valid18 = _errs116 === errors;
}
else {
var valid18 = true;
}
}
}
}
}
else {
const err91 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
}
}
var _valid2 = _errs111 === errors;
if(_valid2 && valid16){
valid16 = false;
passing1 = [passing1, 1];
}
else {
if(_valid2){
valid16 = true;
passing1 = 1;
}
const _errs118 = errors;
if(errors === _errs118){
if(data30 && typeof data30 == "object" && !Array.isArray(data30)){
let missing15;
if(((data30.kind === undefined) && (missing15 = "kind")) || ((data30.id === undefined) && (missing15 = "id"))){
const err92 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/2/required",keyword:"required",params:{missingProperty: missing15},message:"must have required property '"+missing15+"'"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
else {
const _errs120 = errors;
for(const key15 in data30){
if(!((key15 === "id") || (key15 === "kind"))){
const err93 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key15},message:"must NOT have additional properties"};
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
if(_errs120 === errors){
if(data30.id !== undefined){
const _errs121 = errors;
if(typeof data30.id !== "string"){
const err94 = {instancePath:instancePath+"/target/id",schemaPath:"#/definitions/RenameTarget/oneOf/2/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
var valid19 = _errs121 === errors;
}
else {
var valid19 = true;
}
if(valid19){
if(data30.kind !== undefined){
let data36 = data30.kind;
const _errs123 = errors;
if(typeof data36 !== "string"){
const err95 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
if("vessel" !== data36){
const err96 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
var valid19 = _errs123 === errors;
}
else {
var valid19 = true;
}
}
}
}
}
else {
const err97 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
}
var _valid2 = _errs118 === errors;
if(_valid2 && valid16){
valid16 = false;
passing1 = [passing1, 2];
}
else {
if(_valid2){
valid16 = true;
passing1 = 2;
}
const _errs125 = errors;
if(errors === _errs125){
if(data30 && typeof data30 == "object" && !Array.isArray(data30)){
let missing16;
if(((data30.kind === undefined) && (missing16 = "kind")) || ((data30.id === undefined) && (missing16 = "id"))){
const err98 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/3/required",keyword:"required",params:{missingProperty: missing16},message:"must have required property '"+missing16+"'"};
if(vErrors === null){
vErrors = [err98];
}
else {
vErrors.push(err98);
}
errors++;
}
else {
const _errs127 = errors;
for(const key16 in data30){
if(!((key16 === "id") || (key16 === "kind"))){
const err99 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key16},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err99];
}
else {
vErrors.push(err99);
}
errors++;
break;
}
}
if(_errs127 === errors){
if(data30.id !== undefined){
const _errs128 = errors;
if(typeof data30.id !== "string"){
const err100 = {instancePath:instancePath+"/target/id",schemaPath:"#/definitions/RenameTarget/oneOf/3/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err100];
}
else {
vErrors.push(err100);
}
errors++;
}
var valid20 = _errs128 === errors;
}
else {
var valid20 = true;
}
if(valid20){
if(data30.kind !== undefined){
let data38 = data30.kind;
const _errs130 = errors;
if(typeof data38 !== "string"){
const err101 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/3/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err101];
}
else {
vErrors.push(err101);
}
errors++;
}
if("portal" !== data38){
const err102 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/3/properties/kind/const",keyword:"const",params:{allowedValue: "portal"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err102];
}
else {
vErrors.push(err102);
}
errors++;
}
var valid20 = _errs130 === errors;
}
else {
var valid20 = true;
}
}
}
}
}
else {
const err103 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err103];
}
else {
vErrors.push(err103);
}
errors++;
}
}
var _valid2 = _errs125 === errors;
if(_valid2 && valid16){
valid16 = false;
passing1 = [passing1, 3];
}
else {
if(_valid2){
valid16 = true;
passing1 = 3;
}
}
}
}
if(!valid16){
const err104 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf",keyword:"oneOf",params:{passingSchemas: passing1},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err104];
}
else {
vErrors.push(err104);
}
errors++;
}
else {
errors = _errs103;
if(vErrors !== null){
if(_errs103){
vErrors.length = _errs103;
}
else {
vErrors = null;
}
}
}
var valid14 = _errs101 === errors;
}
else {
var valid14 = true;
}
}
}
}
}
}
else {
const err105 = {instancePath,schemaPath:"#/oneOf/12/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err105];
}
else {
vErrors.push(err105);
}
errors++;
}
}
var _valid0 = _errs94 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 12];
}
else {
if(_valid0){
valid0 = true;
passing0 = 12;
}
const _errs132 = errors;
if(errors === _errs132){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing17;
if(((((data.operation === undefined) && (missing17 = "operation")) || ((data.fleet === undefined) && (missing17 = "fleet"))) || ((data.after === undefined) && (missing17 = "after"))) || ((data.axis === undefined) && (missing17 = "axis"))){
const err106 = {instancePath,schemaPath:"#/oneOf/13/required",keyword:"required",params:{missingProperty: missing17},message:"must have required property '"+missing17+"'"};
if(vErrors === null){
vErrors = [err106];
}
else {
vErrors.push(err106);
}
errors++;
}
else {
const _errs134 = errors;
for(const key17 in data){
if(!((((key17 === "after") || (key17 === "axis")) || (key17 === "fleet")) || (key17 === "operation"))){
const err107 = {instancePath,schemaPath:"#/oneOf/13/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key17},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err107];
}
else {
vErrors.push(err107);
}
errors++;
break;
}
}
if(_errs134 === errors){
if(data.after !== undefined){
const _errs135 = errors;
if(typeof data.after !== "string"){
const err108 = {instancePath:instancePath+"/after",schemaPath:"#/oneOf/13/properties/after/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err108];
}
else {
vErrors.push(err108);
}
errors++;
}
var valid21 = _errs135 === errors;
}
else {
var valid21 = true;
}
if(valid21){
if(data.axis !== undefined){
let data40 = data.axis;
const _errs137 = errors;
if(typeof data40 !== "string"){
const err109 = {instancePath:instancePath+"/axis",schemaPath:"#/definitions/Axis/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err109];
}
else {
vErrors.push(err109);
}
errors++;
}
if(!((data40 === "horizontal") || (data40 === "vertical"))){
const err110 = {instancePath:instancePath+"/axis",schemaPath:"#/definitions/Axis/enum",keyword:"enum",params:{allowedValues: schema69.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err110];
}
else {
vErrors.push(err110);
}
errors++;
}
var valid21 = _errs137 === errors;
}
else {
var valid21 = true;
}
if(valid21){
if(data.fleet !== undefined){
const _errs140 = errors;
if(typeof data.fleet !== "string"){
const err111 = {instancePath:instancePath+"/fleet",schemaPath:"#/oneOf/13/properties/fleet/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err111];
}
else {
vErrors.push(err111);
}
errors++;
}
var valid21 = _errs140 === errors;
}
else {
var valid21 = true;
}
if(valid21){
if(data.operation !== undefined){
let data42 = data.operation;
const _errs142 = errors;
if(typeof data42 !== "string"){
const err112 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/13/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err112];
}
else {
vErrors.push(err112);
}
errors++;
}
if("split" !== data42){
const err113 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/13/properties/operation/const",keyword:"const",params:{allowedValue: "split"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err113];
}
else {
vErrors.push(err113);
}
errors++;
}
var valid21 = _errs142 === errors;
}
else {
var valid21 = true;
}
}
}
}
}
}
}
else {
const err114 = {instancePath,schemaPath:"#/oneOf/13/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err114];
}
else {
vErrors.push(err114);
}
errors++;
}
}
var _valid0 = _errs132 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 13];
}
else {
if(_valid0){
valid0 = true;
passing0 = 13;
}
const _errs144 = errors;
if(errors === _errs144){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing18;
if(((((data.operation === undefined) && (missing18 = "operation")) || ((data.fleet === undefined) && (missing18 = "fleet"))) || ((data.path === undefined) && (missing18 = "path"))) || ((data.share === undefined) && (missing18 = "share"))){
const err115 = {instancePath,schemaPath:"#/oneOf/14/required",keyword:"required",params:{missingProperty: missing18},message:"must have required property '"+missing18+"'"};
if(vErrors === null){
vErrors = [err115];
}
else {
vErrors.push(err115);
}
errors++;
}
else {
const _errs146 = errors;
for(const key18 in data){
if(!((((key18 === "fleet") || (key18 === "operation")) || (key18 === "path")) || (key18 === "share"))){
const err116 = {instancePath,schemaPath:"#/oneOf/14/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key18},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err116];
}
else {
vErrors.push(err116);
}
errors++;
break;
}
}
if(_errs146 === errors){
if(data.fleet !== undefined){
const _errs147 = errors;
if(typeof data.fleet !== "string"){
const err117 = {instancePath:instancePath+"/fleet",schemaPath:"#/oneOf/14/properties/fleet/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err117];
}
else {
vErrors.push(err117);
}
errors++;
}
var valid23 = _errs147 === errors;
}
else {
var valid23 = true;
}
if(valid23){
if(data.operation !== undefined){
let data44 = data.operation;
const _errs149 = errors;
if(typeof data44 !== "string"){
const err118 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/14/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err118];
}
else {
vErrors.push(err118);
}
errors++;
}
if("resize-split" !== data44){
const err119 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/14/properties/operation/const",keyword:"const",params:{allowedValue: "resize-split"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err119];
}
else {
vErrors.push(err119);
}
errors++;
}
var valid23 = _errs149 === errors;
}
else {
var valid23 = true;
}
if(valid23){
if(data.path !== undefined){
let data45 = data.path;
const _errs151 = errors;
if(errors === _errs151){
if(Array.isArray(data45)){
if(data45.length > 128){
const err120 = {instancePath:instancePath+"/path",schemaPath:"#/oneOf/14/properties/path/maxItems",keyword:"maxItems",params:{limit: 128},message:"must NOT have more than 128 items"};
if(vErrors === null){
vErrors = [err120];
}
else {
vErrors.push(err120);
}
errors++;
}
else {
var valid24 = true;
const len0 = data45.length;
for(let i0=0; i0<len0; i0++){
let data46 = data45[i0];
const _errs153 = errors;
if(typeof data46 !== "string"){
const err121 = {instancePath:instancePath+"/path/" + i0,schemaPath:"#/definitions/SplitChild/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err121];
}
else {
vErrors.push(err121);
}
errors++;
}
if(!((data46 === "first") || (data46 === "second"))){
const err122 = {instancePath:instancePath+"/path/" + i0,schemaPath:"#/definitions/SplitChild/enum",keyword:"enum",params:{allowedValues: schema75.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err122];
}
else {
vErrors.push(err122);
}
errors++;
}
var valid24 = _errs153 === errors;
if(!valid24){
break;
}
}
}
}
else {
const err123 = {instancePath:instancePath+"/path",schemaPath:"#/oneOf/14/properties/path/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err123];
}
else {
vErrors.push(err123);
}
errors++;
}
}
var valid23 = _errs151 === errors;
}
else {
var valid23 = true;
}
if(valid23){
if(data.share !== undefined){
let data47 = data.share;
const _errs156 = errors;
const _errs157 = errors;
if(!(((typeof data47 == "number") && (!(data47 % 1) && !isNaN(data47))) && (isFinite(data47)))){
const err124 = {instancePath:instancePath+"/share",schemaPath:"#/definitions/SplitShare/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err124];
}
else {
vErrors.push(err124);
}
errors++;
}
if(errors === _errs157){
if((typeof data47 == "number") && (isFinite(data47))){
if(data47 > 9999 || isNaN(data47)){
const err125 = {instancePath:instancePath+"/share",schemaPath:"#/definitions/SplitShare/maximum",keyword:"maximum",params:{comparison: "<=", limit: 9999},message:"must be <= 9999"};
if(vErrors === null){
vErrors = [err125];
}
else {
vErrors.push(err125);
}
errors++;
}
else {
if(data47 < 1 || isNaN(data47)){
const err126 = {instancePath:instancePath+"/share",schemaPath:"#/definitions/SplitShare/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err126];
}
else {
vErrors.push(err126);
}
errors++;
}
}
}
}
var valid23 = _errs156 === errors;
}
else {
var valid23 = true;
}
}
}
}
}
}
}
else {
const err127 = {instancePath,schemaPath:"#/oneOf/14/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err127];
}
else {
vErrors.push(err127);
}
errors++;
}
}
var _valid0 = _errs144 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 14];
}
else {
if(_valid0){
valid0 = true;
passing0 = 14;
}
const _errs159 = errors;
if(errors === _errs159){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing19;
if(((((data.operation === undefined) && (missing19 = "operation")) || ((data.id === undefined) && (missing19 = "id"))) || ((data.target === undefined) && (missing19 = "target"))) || ((data.side === undefined) && (missing19 = "side"))){
const err128 = {instancePath,schemaPath:"#/oneOf/15/required",keyword:"required",params:{missingProperty: missing19},message:"must have required property '"+missing19+"'"};
if(vErrors === null){
vErrors = [err128];
}
else {
vErrors.push(err128);
}
errors++;
}
else {
const _errs161 = errors;
for(const key19 in data){
if(!((((key19 === "id") || (key19 === "operation")) || (key19 === "side")) || (key19 === "target"))){
const err129 = {instancePath,schemaPath:"#/oneOf/15/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key19},message:"must NOT have additional properties"};
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
if(_errs161 === errors){
if(data.id !== undefined){
const _errs162 = errors;
if(typeof data.id !== "string"){
const err130 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/15/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err130];
}
else {
vErrors.push(err130);
}
errors++;
}
var valid27 = _errs162 === errors;
}
else {
var valid27 = true;
}
if(valid27){
if(data.operation !== undefined){
let data49 = data.operation;
const _errs164 = errors;
if(typeof data49 !== "string"){
const err131 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/15/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err131];
}
else {
vErrors.push(err131);
}
errors++;
}
if("move-vessel" !== data49){
const err132 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/15/properties/operation/const",keyword:"const",params:{allowedValue: "move-vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err132];
}
else {
vErrors.push(err132);
}
errors++;
}
var valid27 = _errs164 === errors;
}
else {
var valid27 = true;
}
if(valid27){
if(data.side !== undefined){
let data50 = data.side;
const _errs166 = errors;
if(typeof data50 !== "string"){
const err133 = {instancePath:instancePath+"/side",schemaPath:"#/definitions/Side/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err133];
}
else {
vErrors.push(err133);
}
errors++;
}
if(!((((data50 === "left") || (data50 === "right")) || (data50 === "top")) || (data50 === "bottom"))){
const err134 = {instancePath:instancePath+"/side",schemaPath:"#/definitions/Side/enum",keyword:"enum",params:{allowedValues: schema77.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err134];
}
else {
vErrors.push(err134);
}
errors++;
}
var valid27 = _errs166 === errors;
}
else {
var valid27 = true;
}
if(valid27){
if(data.target !== undefined){
const _errs169 = errors;
if(typeof data.target !== "string"){
const err135 = {instancePath:instancePath+"/target",schemaPath:"#/oneOf/15/properties/target/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err135];
}
else {
vErrors.push(err135);
}
errors++;
}
var valid27 = _errs169 === errors;
}
else {
var valid27 = true;
}
}
}
}
}
}
}
else {
const err136 = {instancePath,schemaPath:"#/oneOf/15/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err136];
}
else {
vErrors.push(err136);
}
errors++;
}
}
var _valid0 = _errs159 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 15];
}
else {
if(_valid0){
valid0 = true;
passing0 = 15;
}
const _errs171 = errors;
if(errors === _errs171){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing20;
if(((((data.operation === undefined) && (missing20 = "operation")) || ((data.id === undefined) && (missing20 = "id"))) || ((data.target === undefined) && (missing20 = "target"))) || ((data.before === undefined) && (missing20 = "before"))){
const err137 = {instancePath,schemaPath:"#/oneOf/16/required",keyword:"required",params:{missingProperty: missing20},message:"must have required property '"+missing20+"'"};
if(vErrors === null){
vErrors = [err137];
}
else {
vErrors.push(err137);
}
errors++;
}
else {
const _errs173 = errors;
for(const key20 in data){
if(!((((key20 === "before") || (key20 === "id")) || (key20 === "operation")) || (key20 === "target"))){
const err138 = {instancePath,schemaPath:"#/oneOf/16/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key20},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err138];
}
else {
vErrors.push(err138);
}
errors++;
break;
}
}
if(_errs173 === errors){
if(data.before !== undefined){
const _errs174 = errors;
if(typeof data.before !== "boolean"){
const err139 = {instancePath:instancePath+"/before",schemaPath:"#/oneOf/16/properties/before/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err139];
}
else {
vErrors.push(err139);
}
errors++;
}
var valid29 = _errs174 === errors;
}
else {
var valid29 = true;
}
if(valid29){
if(data.id !== undefined){
const _errs176 = errors;
if(typeof data.id !== "string"){
const err140 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/16/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err140];
}
else {
vErrors.push(err140);
}
errors++;
}
var valid29 = _errs176 === errors;
}
else {
var valid29 = true;
}
if(valid29){
if(data.operation !== undefined){
let data54 = data.operation;
const _errs178 = errors;
if(typeof data54 !== "string"){
const err141 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/16/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err141];
}
else {
vErrors.push(err141);
}
errors++;
}
if("move-voyage" !== data54){
const err142 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/16/properties/operation/const",keyword:"const",params:{allowedValue: "move-voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err142];
}
else {
vErrors.push(err142);
}
errors++;
}
var valid29 = _errs178 === errors;
}
else {
var valid29 = true;
}
if(valid29){
if(data.target !== undefined){
const _errs180 = errors;
if(typeof data.target !== "string"){
const err143 = {instancePath:instancePath+"/target",schemaPath:"#/oneOf/16/properties/target/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err143];
}
else {
vErrors.push(err143);
}
errors++;
}
var valid29 = _errs180 === errors;
}
else {
var valid29 = true;
}
}
}
}
}
}
}
else {
const err144 = {instancePath,schemaPath:"#/oneOf/16/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err144];
}
else {
vErrors.push(err144);
}
errors++;
}
}
var _valid0 = _errs171 === errors;
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
if(((((data.operation === undefined) && (missing21 = "operation")) || ((data.id === undefined) && (missing21 = "id"))) || ((data.target === undefined) && (missing21 = "target"))) || ((data.before === undefined) && (missing21 = "before"))){
const err145 = {instancePath,schemaPath:"#/oneOf/17/required",keyword:"required",params:{missingProperty: missing21},message:"must have required property '"+missing21+"'"};
if(vErrors === null){
vErrors = [err145];
}
else {
vErrors.push(err145);
}
errors++;
}
else {
const _errs184 = errors;
for(const key21 in data){
if(!((((key21 === "before") || (key21 === "id")) || (key21 === "operation")) || (key21 === "target"))){
const err146 = {instancePath,schemaPath:"#/oneOf/17/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key21},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err146];
}
else {
vErrors.push(err146);
}
errors++;
break;
}
}
if(_errs184 === errors){
if(data.before !== undefined){
const _errs185 = errors;
if(typeof data.before !== "boolean"){
const err147 = {instancePath:instancePath+"/before",schemaPath:"#/oneOf/17/properties/before/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err147];
}
else {
vErrors.push(err147);
}
errors++;
}
var valid30 = _errs185 === errors;
}
else {
var valid30 = true;
}
if(valid30){
if(data.id !== undefined){
const _errs187 = errors;
if(typeof data.id !== "string"){
const err148 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/17/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err148];
}
else {
vErrors.push(err148);
}
errors++;
}
var valid30 = _errs187 === errors;
}
else {
var valid30 = true;
}
if(valid30){
if(data.operation !== undefined){
let data58 = data.operation;
const _errs189 = errors;
if(typeof data58 !== "string"){
const err149 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/17/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err149];
}
else {
vErrors.push(err149);
}
errors++;
}
if("move-fleet" !== data58){
const err150 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/17/properties/operation/const",keyword:"const",params:{allowedValue: "move-fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err150];
}
else {
vErrors.push(err150);
}
errors++;
}
var valid30 = _errs189 === errors;
}
else {
var valid30 = true;
}
if(valid30){
if(data.target !== undefined){
const _errs191 = errors;
if(typeof data.target !== "string"){
const err151 = {instancePath:instancePath+"/target",schemaPath:"#/oneOf/17/properties/target/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err151];
}
else {
vErrors.push(err151);
}
errors++;
}
var valid30 = _errs191 === errors;
}
else {
var valid30 = true;
}
}
}
}
}
}
}
else {
const err152 = {instancePath,schemaPath:"#/oneOf/17/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err152];
}
else {
vErrors.push(err152);
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
const _errs193 = errors;
if(errors === _errs193){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing22;
if(((data.operation === undefined) && (missing22 = "operation")) || ((data.id === undefined) && (missing22 = "id"))){
const err153 = {instancePath,schemaPath:"#/oneOf/18/required",keyword:"required",params:{missingProperty: missing22},message:"must have required property '"+missing22+"'"};
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
for(const key22 in data){
if(!((key22 === "id") || (key22 === "operation"))){
const err154 = {instancePath,schemaPath:"#/oneOf/18/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key22},message:"must NOT have additional properties"};
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
if(data.id !== undefined){
const _errs196 = errors;
if(typeof data.id !== "string"){
const err155 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/18/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err155];
}
else {
vErrors.push(err155);
}
errors++;
}
var valid31 = _errs196 === errors;
}
else {
var valid31 = true;
}
if(valid31){
if(data.operation !== undefined){
let data61 = data.operation;
const _errs198 = errors;
if(typeof data61 !== "string"){
const err156 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/18/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err156];
}
else {
vErrors.push(err156);
}
errors++;
}
if("select-voyage" !== data61){
const err157 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/18/properties/operation/const",keyword:"const",params:{allowedValue: "select-voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err157];
}
else {
vErrors.push(err157);
}
errors++;
}
var valid31 = _errs198 === errors;
}
else {
var valid31 = true;
}
}
}
}
}
else {
const err158 = {instancePath,schemaPath:"#/oneOf/18/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err158];
}
else {
vErrors.push(err158);
}
errors++;
}
}
var _valid0 = _errs193 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 18];
}
else {
if(_valid0){
valid0 = true;
passing0 = 18;
}
const _errs200 = errors;
if(errors === _errs200){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing23;
if(((data.operation === undefined) && (missing23 = "operation")) || ((data.id === undefined) && (missing23 = "id"))){
const err159 = {instancePath,schemaPath:"#/oneOf/19/required",keyword:"required",params:{missingProperty: missing23},message:"must have required property '"+missing23+"'"};
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
for(const key23 in data){
if(!((key23 === "id") || (key23 === "operation"))){
const err160 = {instancePath,schemaPath:"#/oneOf/19/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key23},message:"must NOT have additional properties"};
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
if(data.id !== undefined){
const _errs203 = errors;
if(typeof data.id !== "string"){
const err161 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/19/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err161];
}
else {
vErrors.push(err161);
}
errors++;
}
var valid32 = _errs203 === errors;
}
else {
var valid32 = true;
}
if(valid32){
if(data.operation !== undefined){
let data63 = data.operation;
const _errs205 = errors;
if(typeof data63 !== "string"){
const err162 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/19/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err162];
}
else {
vErrors.push(err162);
}
errors++;
}
if("select-fleet" !== data63){
const err163 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/19/properties/operation/const",keyword:"const",params:{allowedValue: "select-fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err163];
}
else {
vErrors.push(err163);
}
errors++;
}
var valid32 = _errs205 === errors;
}
else {
var valid32 = true;
}
}
}
}
}
else {
const err164 = {instancePath,schemaPath:"#/oneOf/19/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err164];
}
else {
vErrors.push(err164);
}
errors++;
}
}
var _valid0 = _errs200 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 19];
}
else {
if(_valid0){
valid0 = true;
passing0 = 19;
}
const _errs207 = errors;
if(errors === _errs207){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing24;
if(((data.operation === undefined) && (missing24 = "operation")) || ((data.id === undefined) && (missing24 = "id"))){
const err165 = {instancePath,schemaPath:"#/oneOf/20/required",keyword:"required",params:{missingProperty: missing24},message:"must have required property '"+missing24+"'"};
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
for(const key24 in data){
if(!((key24 === "id") || (key24 === "operation"))){
const err166 = {instancePath,schemaPath:"#/oneOf/20/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key24},message:"must NOT have additional properties"};
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
if(data.id !== undefined){
const _errs210 = errors;
if(typeof data.id !== "string"){
const err167 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/20/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err167];
}
else {
vErrors.push(err167);
}
errors++;
}
var valid33 = _errs210 === errors;
}
else {
var valid33 = true;
}
if(valid33){
if(data.operation !== undefined){
let data65 = data.operation;
const _errs212 = errors;
if(typeof data65 !== "string"){
const err168 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/20/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err168];
}
else {
vErrors.push(err168);
}
errors++;
}
if("reveal-vessel" !== data65){
const err169 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/20/properties/operation/const",keyword:"const",params:{allowedValue: "reveal-vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err169];
}
else {
vErrors.push(err169);
}
errors++;
}
var valid33 = _errs212 === errors;
}
else {
var valid33 = true;
}
}
}
}
}
else {
const err170 = {instancePath,schemaPath:"#/oneOf/20/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err170];
}
else {
vErrors.push(err170);
}
errors++;
}
}
var _valid0 = _errs207 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 20];
}
else {
if(_valid0){
valid0 = true;
passing0 = 20;
}
const _errs214 = errors;
if(errors === _errs214){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing25;
if(((data.operation === undefined) && (missing25 = "operation")) || ((data.context === undefined) && (missing25 = "context"))){
const err171 = {instancePath,schemaPath:"#/oneOf/21/required",keyword:"required",params:{missingProperty: missing25},message:"must have required property '"+missing25+"'"};
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
for(const key25 in data){
if(!((key25 === "context") || (key25 === "operation"))){
const err172 = {instancePath,schemaPath:"#/oneOf/21/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key25},message:"must NOT have additional properties"};
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
if(data.context !== undefined){
let data66 = data.context;
const _errs217 = errors;
const _errs219 = errors;
let valid36 = false;
let passing2 = null;
const _errs220 = errors;
if(errors === _errs220){
if(data66 && typeof data66 == "object" && !Array.isArray(data66)){
let missing26;
if((data66.kind === undefined) && (missing26 = "kind")){
const err173 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/0/required",keyword:"required",params:{missingProperty: missing26},message:"must have required property '"+missing26+"'"};
if(vErrors === null){
vErrors = [err173];
}
else {
vErrors.push(err173);
}
errors++;
}
else {
const _errs222 = errors;
for(const key26 in data66){
if(!(key26 === "kind")){
const err174 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key26},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err174];
}
else {
vErrors.push(err174);
}
errors++;
break;
}
}
if(_errs222 === errors){
if(data66.kind !== undefined){
let data67 = data66.kind;
if(typeof data67 !== "string"){
const err175 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err175];
}
else {
vErrors.push(err175);
}
errors++;
}
if("workspace" !== data67){
const err176 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "workspace"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err176];
}
else {
vErrors.push(err176);
}
errors++;
}
}
}
}
}
else {
const err177 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err177];
}
else {
vErrors.push(err177);
}
errors++;
}
}
var _valid3 = _errs220 === errors;
if(_valid3){
valid36 = true;
passing2 = 0;
}
const _errs225 = errors;
if(errors === _errs225){
if(data66 && typeof data66 == "object" && !Array.isArray(data66)){
let missing27;
if(((data66.kind === undefined) && (missing27 = "kind")) || ((data66.id === undefined) && (missing27 = "id"))){
const err178 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/1/required",keyword:"required",params:{missingProperty: missing27},message:"must have required property '"+missing27+"'"};
if(vErrors === null){
vErrors = [err178];
}
else {
vErrors.push(err178);
}
errors++;
}
else {
const _errs227 = errors;
for(const key27 in data66){
if(!((key27 === "id") || (key27 === "kind"))){
const err179 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key27},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err179];
}
else {
vErrors.push(err179);
}
errors++;
break;
}
}
if(_errs227 === errors){
if(data66.id !== undefined){
const _errs228 = errors;
if(typeof data66.id !== "string"){
const err180 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/1/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err180];
}
else {
vErrors.push(err180);
}
errors++;
}
var valid38 = _errs228 === errors;
}
else {
var valid38 = true;
}
if(valid38){
if(data66.kind !== undefined){
let data69 = data66.kind;
const _errs230 = errors;
if(typeof data69 !== "string"){
const err181 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err181];
}
else {
vErrors.push(err181);
}
errors++;
}
if("voyage" !== data69){
const err182 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err182];
}
else {
vErrors.push(err182);
}
errors++;
}
var valid38 = _errs230 === errors;
}
else {
var valid38 = true;
}
}
}
}
}
else {
const err183 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err183];
}
else {
vErrors.push(err183);
}
errors++;
}
}
var _valid3 = _errs225 === errors;
if(_valid3 && valid36){
valid36 = false;
passing2 = [passing2, 1];
}
else {
if(_valid3){
valid36 = true;
passing2 = 1;
}
const _errs232 = errors;
if(errors === _errs232){
if(data66 && typeof data66 == "object" && !Array.isArray(data66)){
let missing28;
if(((data66.kind === undefined) && (missing28 = "kind")) || ((data66.id === undefined) && (missing28 = "id"))){
const err184 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/2/required",keyword:"required",params:{missingProperty: missing28},message:"must have required property '"+missing28+"'"};
if(vErrors === null){
vErrors = [err184];
}
else {
vErrors.push(err184);
}
errors++;
}
else {
const _errs234 = errors;
for(const key28 in data66){
if(!((key28 === "id") || (key28 === "kind"))){
const err185 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key28},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err185];
}
else {
vErrors.push(err185);
}
errors++;
break;
}
}
if(_errs234 === errors){
if(data66.id !== undefined){
const _errs235 = errors;
if(typeof data66.id !== "string"){
const err186 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/2/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err186];
}
else {
vErrors.push(err186);
}
errors++;
}
var valid39 = _errs235 === errors;
}
else {
var valid39 = true;
}
if(valid39){
if(data66.kind !== undefined){
let data71 = data66.kind;
const _errs237 = errors;
if(typeof data71 !== "string"){
const err187 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err187];
}
else {
vErrors.push(err187);
}
errors++;
}
if("fleet" !== data71){
const err188 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err188];
}
else {
vErrors.push(err188);
}
errors++;
}
var valid39 = _errs237 === errors;
}
else {
var valid39 = true;
}
}
}
}
}
else {
const err189 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err189];
}
else {
vErrors.push(err189);
}
errors++;
}
}
var _valid3 = _errs232 === errors;
if(_valid3 && valid36){
valid36 = false;
passing2 = [passing2, 2];
}
else {
if(_valid3){
valid36 = true;
passing2 = 2;
}
const _errs239 = errors;
if(errors === _errs239){
if(data66 && typeof data66 == "object" && !Array.isArray(data66)){
let missing29;
if(((data66.kind === undefined) && (missing29 = "kind")) || ((data66.id === undefined) && (missing29 = "id"))){
const err190 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/3/required",keyword:"required",params:{missingProperty: missing29},message:"must have required property '"+missing29+"'"};
if(vErrors === null){
vErrors = [err190];
}
else {
vErrors.push(err190);
}
errors++;
}
else {
const _errs241 = errors;
for(const key29 in data66){
if(!((key29 === "id") || (key29 === "kind"))){
const err191 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key29},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err191];
}
else {
vErrors.push(err191);
}
errors++;
break;
}
}
if(_errs241 === errors){
if(data66.id !== undefined){
const _errs242 = errors;
if(typeof data66.id !== "string"){
const err192 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/3/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err192];
}
else {
vErrors.push(err192);
}
errors++;
}
var valid40 = _errs242 === errors;
}
else {
var valid40 = true;
}
if(valid40){
if(data66.kind !== undefined){
let data73 = data66.kind;
const _errs244 = errors;
if(typeof data73 !== "string"){
const err193 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/3/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err193];
}
else {
vErrors.push(err193);
}
errors++;
}
if("vessel" !== data73){
const err194 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/3/properties/kind/const",keyword:"const",params:{allowedValue: "vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err194];
}
else {
vErrors.push(err194);
}
errors++;
}
var valid40 = _errs244 === errors;
}
else {
var valid40 = true;
}
}
}
}
}
else {
const err195 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err195];
}
else {
vErrors.push(err195);
}
errors++;
}
}
var _valid3 = _errs239 === errors;
if(_valid3 && valid36){
valid36 = false;
passing2 = [passing2, 3];
}
else {
if(_valid3){
valid36 = true;
passing2 = 3;
}
const _errs246 = errors;
if(errors === _errs246){
if(data66 && typeof data66 == "object" && !Array.isArray(data66)){
let missing30;
if(((data66.kind === undefined) && (missing30 = "kind")) || ((data66.id === undefined) && (missing30 = "id"))){
const err196 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/4/required",keyword:"required",params:{missingProperty: missing30},message:"must have required property '"+missing30+"'"};
if(vErrors === null){
vErrors = [err196];
}
else {
vErrors.push(err196);
}
errors++;
}
else {
const _errs248 = errors;
for(const key30 in data66){
if(!((key30 === "id") || (key30 === "kind"))){
const err197 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key30},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err197];
}
else {
vErrors.push(err197);
}
errors++;
break;
}
}
if(_errs248 === errors){
if(data66.id !== undefined){
const _errs249 = errors;
if(typeof data66.id !== "string"){
const err198 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/4/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err198];
}
else {
vErrors.push(err198);
}
errors++;
}
var valid41 = _errs249 === errors;
}
else {
var valid41 = true;
}
if(valid41){
if(data66.kind !== undefined){
let data75 = data66.kind;
const _errs251 = errors;
if(typeof data75 !== "string"){
const err199 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/4/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err199];
}
else {
vErrors.push(err199);
}
errors++;
}
if("portal" !== data75){
const err200 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/4/properties/kind/const",keyword:"const",params:{allowedValue: "portal"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err200];
}
else {
vErrors.push(err200);
}
errors++;
}
var valid41 = _errs251 === errors;
}
else {
var valid41 = true;
}
}
}
}
}
else {
const err201 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err201];
}
else {
vErrors.push(err201);
}
errors++;
}
}
var _valid3 = _errs246 === errors;
if(_valid3 && valid36){
valid36 = false;
passing2 = [passing2, 4];
}
else {
if(_valid3){
valid36 = true;
passing2 = 4;
}
}
}
}
}
if(!valid36){
const err202 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf",keyword:"oneOf",params:{passingSchemas: passing2},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err202];
}
else {
vErrors.push(err202);
}
errors++;
}
else {
errors = _errs219;
if(vErrors !== null){
if(_errs219){
vErrors.length = _errs219;
}
else {
vErrors = null;
}
}
}
var valid34 = _errs217 === errors;
}
else {
var valid34 = true;
}
if(valid34){
if(data.operation !== undefined){
let data76 = data.operation;
const _errs253 = errors;
if(typeof data76 !== "string"){
const err203 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/21/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err203];
}
else {
vErrors.push(err203);
}
errors++;
}
if("dock" !== data76){
const err204 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/21/properties/operation/const",keyword:"const",params:{allowedValue: "dock"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err204];
}
else {
vErrors.push(err204);
}
errors++;
}
var valid34 = _errs253 === errors;
}
else {
var valid34 = true;
}
}
}
}
}
else {
const err205 = {instancePath,schemaPath:"#/oneOf/21/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err205];
}
else {
vErrors.push(err205);
}
errors++;
}
}
var _valid0 = _errs214 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 21];
}
else {
if(_valid0){
valid0 = true;
passing0 = 21;
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
}
}
}
}
if(!valid0){
const err206 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err206];
}
else {
vErrors.push(err206);
}
errors++;
validate33.errors = vErrors;
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
validate33.errors = vErrors;
return errors === 0;
}


function validate32(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
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
if(!(validate33(data.action, {instancePath:instancePath+"/action",parentData:data,parentDataProperty:"action",rootData}))){
vErrors = vErrors === null ? validate33.errors : vErrors.concat(validate33.errors);
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
validate32.errors = vErrors;
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
validate32.errors = vErrors;
return errors === 0;
}

const pattern0 = new RegExp("^-?[0-9]+$", "u");

function validate31(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((((((data.name === undefined) && (missing0 = "name")) || ((data.callId === undefined) && (missing0 = "callId"))) || ((data.callbackIds === undefined) && (missing0 = "callbackIds"))) || ((data.requestId === undefined) && (missing0 = "requestId"))) || ((data.action === undefined) && (missing0 = "action"))) || ((data.status === undefined) && (missing0 = "status"))){
validate31.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(((((((key0 === "action") || (key0 === "callId")) || (key0 === "callbackIds")) || (key0 === "name")) || (key0 === "requestId")) || (key0 === "status")) || (key0 === "version"))){
validate31.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.action !== undefined){
const _errs2 = errors;
if(!(validate32(data.action, {instancePath:instancePath+"/action",parentData:data,parentDataProperty:"action",rootData}))){
vErrors = vErrors === null ? validate32.errors : vErrors.concat(validate32.errors);
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
validate31.errors = [{instancePath:instancePath+"/callId",schemaPath:"#/properties/callId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate31.errors = vErrors;
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
validate31.errors = [{instancePath:instancePath+"/callbackIds",schemaPath:"#/properties/callbackIds/type",keyword:"type",params:{type: "array"},message:"must be array"}];
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
validate31.errors = [{instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate31.errors = [{instancePath:instancePath+"/requestId",schemaPath:"#/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate31.errors = [{instancePath:instancePath+"/status",schemaPath:"#/definitions/Status/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!(((data10 === "applied") || (data10 === "rejected")) || (data10 === "uncertain"))){
validate31.errors = [{instancePath:instancePath+"/status",schemaPath:"#/definitions/Status/enum",keyword:"enum",params:{allowedValues: schema82.enum},message:"must be equal to one of the allowed values"}];
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
validate31.errors = [{instancePath:instancePath+"/version",schemaPath:"#/properties/version/type",keyword:"type",params:{type: schema58.properties.version.type},message:"must be string,null"}];
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
validate31.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate31.errors = vErrors;
return errors === 0;
}


function validate28(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((((data.id === undefined) && (missing0 = "id")) || ((data.requestId === undefined) && (missing0 = "requestId"))) || ((data.role === undefined) && (missing0 = "role"))) || ((data.text === undefined) && (missing0 = "text"))){
validate28.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((((((key0 === "context") || (key0 === "id")) || (key0 === "requestId")) || (key0 === "role")) || (key0 === "text")) || (key0 === "tool"))){
validate28.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
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
if(!(validate29(data0, {instancePath:instancePath+"/context",parentData:data,parentDataProperty:"context",rootData}))){
vErrors = vErrors === null ? validate29.errors : vErrors.concat(validate29.errors);
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
validate28.errors = vErrors;
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
validate28.errors = [{instancePath:instancePath+"/id",schemaPath:"#/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate28.errors = [{instancePath:instancePath+"/requestId",schemaPath:"#/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate28.errors = [{instancePath:instancePath+"/role",schemaPath:"#/definitions/Role/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!(((data3 === "user") || (data3 === "assistant")) || (data3 === "tool"))){
validate28.errors = [{instancePath:instancePath+"/role",schemaPath:"#/definitions/Role/enum",keyword:"enum",params:{allowedValues: schema57.enum},message:"must be equal to one of the allowed values"}];
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
validate28.errors = [{instancePath:instancePath+"/text",schemaPath:"#/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
if(!(validate31(data5, {instancePath:instancePath+"/tool",parentData:data,parentDataProperty:"tool",rootData}))){
vErrors = vErrors === null ? validate31.errors : vErrors.concat(validate31.errors);
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
validate28.errors = vErrors;
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
validate28.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate28.errors = vErrors;
return errors === 0;
}


function validate27(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((((((data.version === undefined) && (missing0 = "version")) || ((data.phase === undefined) && (missing0 = "phase"))) || ((data.messages === undefined) && (missing0 = "messages"))) || ((data.limited === undefined) && (missing0 = "limited"))) || ((data.omitted === undefined) && (missing0 = "omitted"))){
validate27.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(func2.call(schema53.properties, key0))){
validate27.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.error !== undefined){
let data0 = data.error;
const _errs2 = errors;
if((typeof data0 !== "string") && (data0 !== null)){
validate27.errors = [{instancePath:instancePath+"/error",schemaPath:"#/properties/error/type",keyword:"type",params:{type: schema53.properties.error.type},message:"must be string,null"}];
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
validate27.errors = [{instancePath:instancePath+"/limited",schemaPath:"#/properties/limited/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"}];
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
if(!(validate28(data2[i0], {instancePath:instancePath+"/messages/" + i0,parentData:data2,parentDataProperty:i0,rootData}))){
vErrors = vErrors === null ? validate28.errors : vErrors.concat(validate28.errors);
errors = vErrors.length;
}
var valid1 = _errs8 === errors;
if(!valid1){
break;
}
}
}
else {
validate27.errors = [{instancePath:instancePath+"/messages",schemaPath:"#/properties/messages/type",keyword:"type",params:{type: "array"},message:"must be array"}];
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
validate27.errors = [{instancePath:instancePath+"/model",schemaPath:"#/properties/model/type",keyword:"type",params:{type: schema53.properties.model.type},message:"must be string,null"}];
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
validate27.errors = [{instancePath:instancePath+"/omitted",schemaPath:"#/properties/omitted/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate27.errors = [{instancePath:instancePath+"/phase",schemaPath:"#/definitions/Phase/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!(((((((data6 === "idle") || (data6 === "starting")) || (data6 === "working")) || (data6 === "completed")) || (data6 === "interrupted")) || (data6 === "failed")) || (data6 === "unconfirmed"))){
validate27.errors = [{instancePath:instancePath+"/phase",schemaPath:"#/definitions/Phase/enum",keyword:"enum",params:{allowedValues: schema83.enum},message:"must be equal to one of the allowed values"}];
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
validate27.errors = [{instancePath:instancePath+"/thread",schemaPath:"#/properties/thread/type",keyword:"type",params:{type: schema53.properties.thread.type},message:"must be string,null"}];
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
validate27.errors = [{instancePath:instancePath+"/turn",schemaPath:"#/properties/turn/type",keyword:"type",params:{type: schema53.properties.turn.type},message:"must be string,null"}];
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
validate27.errors = [{instancePath:instancePath+"/version",schemaPath:"#/properties/version/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate27.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate27.errors = vErrors;
return errors === 0;
}

export const launchCatalog = validate46;
const schema84 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"definitions":{"Effort":{"enum":["low","medium","high","xhigh","max","ultra"],"type":"string"},"Launch":{"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"terminal","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"effort":{"allOf":[{"$ref":"#/definitions/Effort"}],"default":"high"},"kind":{"const":"codex","type":"string"},"model":{"default":"gpt-6.1-sol","type":"string"},"permissions":{"allOf":[{"$ref":"#/definitions/Permissions"}],"default":"yolo"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"argv":{"items":{"type":"string"},"type":"array"},"kind":{"const":"program","type":"string"}},"required":["kind","argv"],"type":"object"}]},"LaunchEntry":{"additionalProperties":false,"properties":{"id":{"type":"string"},"launch":{"$ref":"#/definitions/Launch"},"name":{"type":"string"}},"required":["id","name","launch"],"type":"object"},"LaunchSettings":{"additionalProperties":false,"properties":{"default":{"type":"string"},"entries":{"items":{"$ref":"#/definitions/LaunchEntry"},"type":"array"}},"required":["default","entries"],"type":"object"},"Permissions":{"enum":["yolo","workspace-write","read-only"],"type":"string"}},"properties":{"available":{"items":{"type":"string"},"type":"array"},"errors":{"items":{"type":"string"},"type":"array"},"path":{"type":["string","null"]},"settings":{"$ref":"#/definitions/LaunchSettings"}},"required":["settings","available","errors"],"title":"Catalog","type":"object"};
const schema85 = {"additionalProperties":false,"properties":{"default":{"type":"string"},"entries":{"items":{"$ref":"#/definitions/LaunchEntry"},"type":"array"}},"required":["default","entries"],"type":"object"};
const schema86 = {"additionalProperties":false,"properties":{"id":{"type":"string"},"launch":{"$ref":"#/definitions/Launch"},"name":{"type":"string"}},"required":["id","name","launch"],"type":"object"};
const schema87 = {"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"terminal","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"effort":{"allOf":[{"$ref":"#/definitions/Effort"}],"default":"high"},"kind":{"const":"codex","type":"string"},"model":{"default":"gpt-6.1-sol","type":"string"},"permissions":{"allOf":[{"$ref":"#/definitions/Permissions"}],"default":"yolo"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"argv":{"items":{"type":"string"},"type":"array"},"kind":{"const":"program","type":"string"}},"required":["kind","argv"],"type":"object"}]};
const schema88 = {"enum":["low","medium","high","xhigh","max","ultra"],"type":"string"};
const schema89 = {"enum":["yolo","workspace-write","read-only"],"type":"string"};

function validate49(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(errors === _errs1){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((data.kind === undefined) && (missing0 = "kind")){
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
if(!(key0 === "kind")){
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
if("terminal" !== data0){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "terminal"},message:"must be equal to constant"};
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
if((data.kind === undefined) && (missing1 = "kind")){
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
if(!((((key1 === "effort") || (key1 === "kind")) || (key1 === "model")) || (key1 === "permissions"))){
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
if(data.effort !== undefined){
let data1 = data.effort;
const _errs9 = errors;
if(typeof data1 !== "string"){
const err7 = {instancePath:instancePath+"/effort",schemaPath:"#/definitions/Effort/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(!((((((data1 === "low") || (data1 === "medium")) || (data1 === "high")) || (data1 === "xhigh")) || (data1 === "max")) || (data1 === "ultra"))){
const err8 = {instancePath:instancePath+"/effort",schemaPath:"#/definitions/Effort/enum",keyword:"enum",params:{allowedValues: schema88.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
var valid2 = _errs9 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data.kind !== undefined){
let data2 = data.kind;
const _errs13 = errors;
if(typeof data2 !== "string"){
const err9 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if("codex" !== data2){
const err10 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "codex"},message:"must be equal to constant"};
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
if(valid2){
if(data.model !== undefined){
const _errs15 = errors;
if(typeof data.model !== "string"){
const err11 = {instancePath:instancePath+"/model",schemaPath:"#/oneOf/1/properties/model/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
if(data.permissions !== undefined){
let data4 = data.permissions;
const _errs17 = errors;
if(typeof data4 !== "string"){
const err12 = {instancePath:instancePath+"/permissions",schemaPath:"#/definitions/Permissions/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(!(((data4 === "yolo") || (data4 === "workspace-write")) || (data4 === "read-only"))){
const err13 = {instancePath:instancePath+"/permissions",schemaPath:"#/definitions/Permissions/enum",keyword:"enum",params:{allowedValues: schema89.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
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
const _errs21 = errors;
if(errors === _errs21){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing2;
if(((data.kind === undefined) && (missing2 = "kind")) || ((data.argv === undefined) && (missing2 = "argv"))){
const err15 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"};
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
for(const key2 in data){
if(!((key2 === "argv") || (key2 === "kind"))){
const err16 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
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
if(data.argv !== undefined){
let data5 = data.argv;
const _errs24 = errors;
if(errors === _errs24){
if(Array.isArray(data5)){
var valid8 = true;
const len0 = data5.length;
for(let i0=0; i0<len0; i0++){
const _errs26 = errors;
if(typeof data5[i0] !== "string"){
const err17 = {instancePath:instancePath+"/argv/" + i0,schemaPath:"#/oneOf/2/properties/argv/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
var valid8 = _errs26 === errors;
if(!valid8){
break;
}
}
}
else {
const err18 = {instancePath:instancePath+"/argv",schemaPath:"#/oneOf/2/properties/argv/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
var valid7 = _errs24 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data.kind !== undefined){
let data7 = data.kind;
const _errs28 = errors;
if(typeof data7 !== "string"){
const err19 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if("program" !== data7){
const err20 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "program"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
var valid7 = _errs28 === errors;
}
else {
var valid7 = true;
}
}
}
}
}
else {
const err21 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
var _valid0 = _errs21 === errors;
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
const err22 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
validate49.errors = vErrors;
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
validate49.errors = vErrors;
return errors === 0;
}


function validate48(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((((data.id === undefined) && (missing0 = "id")) || ((data.name === undefined) && (missing0 = "name"))) || ((data.launch === undefined) && (missing0 = "launch"))){
validate48.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(((key0 === "id") || (key0 === "launch")) || (key0 === "name"))){
validate48.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.id !== undefined){
const _errs2 = errors;
if(typeof data.id !== "string"){
validate48.errors = [{instancePath:instancePath+"/id",schemaPath:"#/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.launch !== undefined){
const _errs4 = errors;
if(!(validate49(data.launch, {instancePath:instancePath+"/launch",parentData:data,parentDataProperty:"launch",rootData}))){
vErrors = vErrors === null ? validate49.errors : vErrors.concat(validate49.errors);
errors = vErrors.length;
}
var valid0 = _errs4 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.name !== undefined){
const _errs5 = errors;
if(typeof data.name !== "string"){
validate48.errors = [{instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate48.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate48.errors = vErrors;
return errors === 0;
}


function validate47(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((data.default === undefined) && (missing0 = "default")) || ((data.entries === undefined) && (missing0 = "entries"))){
validate47.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((key0 === "default") || (key0 === "entries"))){
validate47.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.default !== undefined){
const _errs2 = errors;
if(typeof data.default !== "string"){
validate47.errors = [{instancePath:instancePath+"/default",schemaPath:"#/properties/default/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.entries !== undefined){
let data1 = data.entries;
const _errs4 = errors;
if(errors === _errs4){
if(Array.isArray(data1)){
var valid1 = true;
const len0 = data1.length;
for(let i0=0; i0<len0; i0++){
const _errs6 = errors;
if(!(validate48(data1[i0], {instancePath:instancePath+"/entries/" + i0,parentData:data1,parentDataProperty:i0,rootData}))){
vErrors = vErrors === null ? validate48.errors : vErrors.concat(validate48.errors);
errors = vErrors.length;
}
var valid1 = _errs6 === errors;
if(!valid1){
break;
}
}
}
else {
validate47.errors = [{instancePath:instancePath+"/entries",schemaPath:"#/properties/entries/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
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
validate47.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate47.errors = vErrors;
return errors === 0;
}


function validate46(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((((data.settings === undefined) && (missing0 = "settings")) || ((data.available === undefined) && (missing0 = "available"))) || ((data.errors === undefined) && (missing0 = "errors"))){
validate46.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((((key0 === "available") || (key0 === "errors")) || (key0 === "path")) || (key0 === "settings"))){
validate46.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.available !== undefined){
let data0 = data.available;
const _errs2 = errors;
if(errors === _errs2){
if(Array.isArray(data0)){
var valid1 = true;
const len0 = data0.length;
for(let i0=0; i0<len0; i0++){
const _errs4 = errors;
if(typeof data0[i0] !== "string"){
validate46.errors = [{instancePath:instancePath+"/available/" + i0,schemaPath:"#/properties/available/items/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid1 = _errs4 === errors;
if(!valid1){
break;
}
}
}
else {
validate46.errors = [{instancePath:instancePath+"/available",schemaPath:"#/properties/available/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.errors !== undefined){
let data2 = data.errors;
const _errs6 = errors;
if(errors === _errs6){
if(Array.isArray(data2)){
var valid2 = true;
const len1 = data2.length;
for(let i1=0; i1<len1; i1++){
const _errs8 = errors;
if(typeof data2[i1] !== "string"){
validate46.errors = [{instancePath:instancePath+"/errors/" + i1,schemaPath:"#/properties/errors/items/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid2 = _errs8 === errors;
if(!valid2){
break;
}
}
}
else {
validate46.errors = [{instancePath:instancePath+"/errors",schemaPath:"#/properties/errors/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
var valid0 = _errs6 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.path !== undefined){
let data4 = data.path;
const _errs10 = errors;
if((typeof data4 !== "string") && (data4 !== null)){
validate46.errors = [{instancePath:instancePath+"/path",schemaPath:"#/properties/path/type",keyword:"type",params:{type: schema84.properties.path.type},message:"must be string,null"}];
return false;
}
var valid0 = _errs10 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.settings !== undefined){
const _errs12 = errors;
if(!(validate47(data.settings, {instancePath:instancePath+"/settings",parentData:data,parentDataProperty:"settings",rootData}))){
vErrors = vErrors === null ? validate47.errors : vErrors.concat(validate47.errors);
errors = vErrors.length;
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
else {
validate46.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate46.errors = vErrors;
return errors === 0;
}

export const notes = validate53;
const schema90 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"properties":{"text":{"type":"string"},"title":{"type":"string"}},"required":["title","text"],"title":"Notes","type":"object"};

function validate53(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((data.title === undefined) && (missing0 = "title")) || ((data.text === undefined) && (missing0 = "text"))){
validate53.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((key0 === "text") || (key0 === "title"))){
validate53.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.text !== undefined){
const _errs2 = errors;
if(typeof data.text !== "string"){
validate53.errors = [{instancePath:instancePath+"/text",schemaPath:"#/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate53.errors = [{instancePath:instancePath+"/title",schemaPath:"#/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate53.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate53.errors = vErrors;
return errors === 0;
}

export const processResponse = validate54;
const schema91 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"definitions":{"ProcessInfo":{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"cwd":{"type":"string"},"foreground":{"type":["string","null"]},"pid":{"maximum":4294967295,"minimum":0,"type":["integer","null"]},"state":{"type":"string"},"terminalId":{"type":"string"}},"required":["contentId","terminalId","cwd","state"],"type":"object"},"ProcessOutput":{"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"list","type":"string"},"processes":{"items":{"$ref":"#/definitions/ProcessInfo"},"type":"array"},"unavailable":{"items":{"type":"string"},"type":"array"}},"required":["operation","processes","unavailable"],"type":"object"},{"additionalProperties":false,"properties":{"complete":{"type":"boolean"},"how":{"type":"string"},"limited":{"type":"boolean"},"operation":{"const":"read","type":"string"},"target":{"$ref":"#/definitions/ProcessInfo"},"text":{"type":"string"},"why":{"type":["string","null"]}},"required":["operation","target","text","complete","how","limited"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"send","type":"string"},"started":{"type":["boolean","null"]},"status":{"type":["string","null"]},"target":{"$ref":"#/definitions/ProcessInfo"},"turn":{"type":"string"}},"required":["operation","target","turn"],"type":"object"},{"additionalProperties":false,"properties":{"key":{"type":"string"},"operation":{"const":"interrupt","type":"string"},"outcome":{"type":"string"},"target":{"$ref":"#/definitions/ProcessInfo"}},"required":["operation","target","key","outcome"],"type":"object"},{"additionalProperties":false,"properties":{"observed":{"$ref":"#/definitions/ProcessInfo"},"operation":{"const":"stop","type":"string"},"target":{"$ref":"#/definitions/ProcessInfo"}},"required":["operation","target","observed"],"type":"object"}]},"Status":{"enum":["applied","rejected","uncertain"],"type":"string"}},"properties":{"fresh":{"type":"boolean"},"message":{"type":["string","null"]},"output":{"anyOf":[{"$ref":"#/definitions/ProcessOutput"},{"type":"null"}]},"requestId":{"type":"string"},"status":{"$ref":"#/definitions/Status"},"version":{"type":"string"}},"required":["requestId","status","version","fresh"],"title":"ProcessResponse","type":"object"};
const schema99 = {"enum":["applied","rejected","uncertain"],"type":"string"};
const schema92 = {"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"list","type":"string"},"processes":{"items":{"$ref":"#/definitions/ProcessInfo"},"type":"array"},"unavailable":{"items":{"type":"string"},"type":"array"}},"required":["operation","processes","unavailable"],"type":"object"},{"additionalProperties":false,"properties":{"complete":{"type":"boolean"},"how":{"type":"string"},"limited":{"type":"boolean"},"operation":{"const":"read","type":"string"},"target":{"$ref":"#/definitions/ProcessInfo"},"text":{"type":"string"},"why":{"type":["string","null"]}},"required":["operation","target","text","complete","how","limited"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"send","type":"string"},"started":{"type":["boolean","null"]},"status":{"type":["string","null"]},"target":{"$ref":"#/definitions/ProcessInfo"},"turn":{"type":"string"}},"required":["operation","target","turn"],"type":"object"},{"additionalProperties":false,"properties":{"key":{"type":"string"},"operation":{"const":"interrupt","type":"string"},"outcome":{"type":"string"},"target":{"$ref":"#/definitions/ProcessInfo"}},"required":["operation","target","key","outcome"],"type":"object"},{"additionalProperties":false,"properties":{"observed":{"$ref":"#/definitions/ProcessInfo"},"operation":{"const":"stop","type":"string"},"target":{"$ref":"#/definitions/ProcessInfo"}},"required":["operation","target","observed"],"type":"object"}]};
const schema93 = {"additionalProperties":false,"properties":{"contentId":{"type":"string"},"cwd":{"type":"string"},"foreground":{"type":["string","null"]},"pid":{"maximum":4294967295,"minimum":0,"type":["integer","null"]},"state":{"type":"string"},"terminalId":{"type":"string"}},"required":["contentId","terminalId","cwd","state"],"type":"object"};

function validate55(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
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
const err8 = {instancePath:instancePath+"/processes/" + i0+"/foreground",schemaPath:"#/definitions/ProcessInfo/properties/foreground/type",keyword:"type",params:{type: schema93.properties.foreground.type},message:"must be string,null"};
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
const err9 = {instancePath:instancePath+"/processes/" + i0+"/pid",schemaPath:"#/definitions/ProcessInfo/properties/pid/type",keyword:"type",params:{type: schema93.properties.pid.type},message:"must be integer,null"};
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
const err30 = {instancePath:instancePath+"/target/foreground",schemaPath:"#/definitions/ProcessInfo/properties/foreground/type",keyword:"type",params:{type: schema93.properties.foreground.type},message:"must be string,null"};
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
const err31 = {instancePath:instancePath+"/target/pid",schemaPath:"#/definitions/ProcessInfo/properties/pid/type",keyword:"type",params:{type: schema93.properties.pid.type},message:"must be integer,null"};
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
const err38 = {instancePath:instancePath+"/why",schemaPath:"#/oneOf/1/properties/why/type",keyword:"type",params:{type: schema92.oneOf[1].properties.why.type},message:"must be string,null"};
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
const err44 = {instancePath:instancePath+"/started",schemaPath:"#/oneOf/2/properties/started/type",keyword:"type",params:{type: schema92.oneOf[2].properties.started.type},message:"must be boolean,null"};
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
const err45 = {instancePath:instancePath+"/status",schemaPath:"#/oneOf/2/properties/status/type",keyword:"type",params:{type: schema92.oneOf[2].properties.status.type},message:"must be string,null"};
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
const err50 = {instancePath:instancePath+"/target/foreground",schemaPath:"#/definitions/ProcessInfo/properties/foreground/type",keyword:"type",params:{type: schema93.properties.foreground.type},message:"must be string,null"};
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
const err51 = {instancePath:instancePath+"/target/pid",schemaPath:"#/definitions/ProcessInfo/properties/pid/type",keyword:"type",params:{type: schema93.properties.pid.type},message:"must be integer,null"};
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
const err69 = {instancePath:instancePath+"/target/foreground",schemaPath:"#/definitions/ProcessInfo/properties/foreground/type",keyword:"type",params:{type: schema93.properties.foreground.type},message:"must be string,null"};
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
const err70 = {instancePath:instancePath+"/target/pid",schemaPath:"#/definitions/ProcessInfo/properties/pid/type",keyword:"type",params:{type: schema93.properties.pid.type},message:"must be integer,null"};
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
const err83 = {instancePath:instancePath+"/observed/foreground",schemaPath:"#/definitions/ProcessInfo/properties/foreground/type",keyword:"type",params:{type: schema93.properties.foreground.type},message:"must be string,null"};
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
const err84 = {instancePath:instancePath+"/observed/pid",schemaPath:"#/definitions/ProcessInfo/properties/pid/type",keyword:"type",params:{type: schema93.properties.pid.type},message:"must be integer,null"};
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
const err96 = {instancePath:instancePath+"/target/foreground",schemaPath:"#/definitions/ProcessInfo/properties/foreground/type",keyword:"type",params:{type: schema93.properties.foreground.type},message:"must be string,null"};
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
const err97 = {instancePath:instancePath+"/target/pid",schemaPath:"#/definitions/ProcessInfo/properties/pid/type",keyword:"type",params:{type: schema93.properties.pid.type},message:"must be integer,null"};
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
validate55.errors = vErrors;
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
validate55.errors = vErrors;
return errors === 0;
}


function validate54(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((((data.requestId === undefined) && (missing0 = "requestId")) || ((data.status === undefined) && (missing0 = "status"))) || ((data.version === undefined) && (missing0 = "version"))) || ((data.fresh === undefined) && (missing0 = "fresh"))){
validate54.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((((((key0 === "fresh") || (key0 === "message")) || (key0 === "output")) || (key0 === "requestId")) || (key0 === "status")) || (key0 === "version"))){
validate54.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.fresh !== undefined){
const _errs2 = errors;
if(typeof data.fresh !== "boolean"){
validate54.errors = [{instancePath:instancePath+"/fresh",schemaPath:"#/properties/fresh/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"}];
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
validate54.errors = [{instancePath:instancePath+"/message",schemaPath:"#/properties/message/type",keyword:"type",params:{type: schema91.properties.message.type},message:"must be string,null"}];
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
if(!(validate55(data2, {instancePath:instancePath+"/output",parentData:data,parentDataProperty:"output",rootData}))){
vErrors = vErrors === null ? validate55.errors : vErrors.concat(validate55.errors);
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
validate54.errors = vErrors;
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
validate54.errors = [{instancePath:instancePath+"/requestId",schemaPath:"#/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate54.errors = [{instancePath:instancePath+"/status",schemaPath:"#/definitions/Status/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!(((data4 === "applied") || (data4 === "rejected")) || (data4 === "uncertain"))){
validate54.errors = [{instancePath:instancePath+"/status",schemaPath:"#/definitions/Status/enum",keyword:"enum",params:{allowedValues: schema99.enum},message:"must be equal to one of the allowed values"}];
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
validate54.errors = [{instancePath:instancePath+"/version",schemaPath:"#/properties/version/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate54.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate54.errors = vErrors;
return errors === 0;
}

export const processTool = validate57;
const schema100 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"definitions":{"ProcessAction":{"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"list","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"lines":{"maximum":160,"minimum":0,"type":"integer"},"operation":{"const":"read","type":"string"},"terminalId":{"type":"string"}},"required":["operation","contentId","terminalId","lines"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"send","type":"string"},"pid":{"maximum":4294967295,"minimum":0,"type":"integer"},"terminalId":{"type":"string"},"text":{"type":"string"}},"required":["operation","contentId","terminalId","pid","text"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"interrupt","type":"string"},"pid":{"maximum":4294967295,"minimum":0,"type":"integer"},"terminalId":{"type":"string"}},"required":["operation","contentId","terminalId","pid"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"stop","type":"string"},"pid":{"maximum":4294967295,"minimum":0,"type":"integer"},"terminalId":{"type":"string"}},"required":["operation","contentId","terminalId","pid"],"type":"object"}]}},"properties":{"action":{"$ref":"#/definitions/ProcessAction"},"expectedVersion":{"type":"string"}},"required":["expectedVersion","action"],"title":"ProcessInput","type":"object"};
const schema101 = {"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"list","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"lines":{"maximum":160,"minimum":0,"type":"integer"},"operation":{"const":"read","type":"string"},"terminalId":{"type":"string"}},"required":["operation","contentId","terminalId","lines"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"send","type":"string"},"pid":{"maximum":4294967295,"minimum":0,"type":"integer"},"terminalId":{"type":"string"},"text":{"type":"string"}},"required":["operation","contentId","terminalId","pid","text"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"interrupt","type":"string"},"pid":{"maximum":4294967295,"minimum":0,"type":"integer"},"terminalId":{"type":"string"}},"required":["operation","contentId","terminalId","pid"],"type":"object"},{"additionalProperties":false,"properties":{"contentId":{"type":"string"},"operation":{"const":"stop","type":"string"},"pid":{"maximum":4294967295,"minimum":0,"type":"integer"},"terminalId":{"type":"string"}},"required":["operation","contentId","terminalId","pid"],"type":"object"}]};

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
validate57.errors = vErrors;
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
validate57.errors = [{instancePath:instancePath+"/expectedVersion",schemaPath:"#/properties/expectedVersion/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate57.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate57.errors = vErrors;
return errors === 0;
}

export const request = validate58;
const schema102 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"definitions":{"Action":{"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"inspect","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"home","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"canvas":{"$ref":"#/definitions/Canvas"},"operation":{"const":"update-canvas","type":"string"}},"required":["operation","canvas"],"type":"object"},{"additionalProperties":false,"properties":{"collapsed":{"type":"boolean"},"operation":{"const":"set-sidebar","type":"string"}},"required":["operation","collapsed"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"name":{"type":"string"},"operation":{"const":"save-layout","type":"string"}},"required":["operation","fleet","name"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"name":{"type":"string"},"operation":{"const":"load-layout","type":"string"}},"required":["operation","fleet","name"],"type":"object"},{"additionalProperties":false,"properties":{"cwd":{"type":"string"},"name":{"type":"string"},"operation":{"const":"create-voyage","type":"string"}},"required":["operation","name","cwd"],"type":"object"},{"additionalProperties":false,"properties":{"name":{"type":"string"},"operation":{"const":"create-fleet","type":"string"},"voyage":{"type":"string"}},"required":["operation","voyage","name"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"create-portal","type":"string"},"voyage":{"type":"string"}},"required":["operation","voyage"],"type":"object"},{"additionalProperties":false,"properties":{"destination":{"$ref":"#/definitions/ContentDestination"},"launch":{"anyOf":[{"$ref":"#/definitions/Launch"},{"type":"null"}]},"operation":{"const":"create-content","type":"string"},"typeId":{"type":"string"}},"required":["operation","typeId","destination"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"remove-content-package","type":"string"},"typeId":{"type":"string"}},"required":["operation","typeId"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"restore-content-package","type":"string"},"typeId":{"type":"string"}},"required":["operation","typeId"],"type":"object"},{"additionalProperties":false,"properties":{"name":{"type":"string"},"operation":{"const":"rename","type":"string"},"target":{"$ref":"#/definitions/RenameTarget"}},"required":["operation","target","name"],"type":"object"},{"additionalProperties":false,"properties":{"after":{"type":"string"},"axis":{"$ref":"#/definitions/Axis"},"fleet":{"type":"string"},"operation":{"const":"split","type":"string"}},"required":["operation","fleet","after","axis"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"operation":{"const":"resize-split","type":"string"},"path":{"items":{"$ref":"#/definitions/SplitChild"},"maxItems":128,"type":"array"},"share":{"$ref":"#/definitions/SplitShare"}},"required":["operation","fleet","path","share"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"move-vessel","type":"string"},"side":{"$ref":"#/definitions/Side"},"target":{"type":"string"}},"required":["operation","id","target","side"],"type":"object"},{"additionalProperties":false,"properties":{"before":{"type":"boolean"},"id":{"type":"string"},"operation":{"const":"move-voyage","type":"string"},"target":{"type":"string"}},"required":["operation","id","target","before"],"type":"object"},{"additionalProperties":false,"properties":{"before":{"type":"boolean"},"id":{"type":"string"},"operation":{"const":"move-fleet","type":"string"},"target":{"type":"string"}},"required":["operation","id","target","before"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"select-voyage","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"select-fleet","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"reveal-vessel","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"context":{"$ref":"#/definitions/Context"},"operation":{"const":"dock","type":"string"}},"required":["operation","context"],"type":"object"}]},"Axis":{"enum":["horizontal","vertical"],"type":"string"},"Canvas":{"additionalProperties":false,"properties":{"portalMode":{"allOf":[{"$ref":"#/definitions/PortalMode"}],"default":"overlay"},"root":{"$ref":"#/definitions/Node"},"sidebarCollapsed":{"default":false,"type":"boolean"}},"required":["root"],"type":"object"},"ContentDestination":{"oneOf":[{"additionalProperties":false,"properties":{"after":{"type":"string"},"axis":{"$ref":"#/definitions/Axis"},"fleet":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","fleet","after","axis"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"portal","type":"string"},"voyage":{"type":"string"}},"required":["kind","voyage"],"type":"object"}]},"Context":{"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"workspace","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]},"Effort":{"enum":["low","medium","high","xhigh","max","ultra"],"type":"string"},"Launch":{"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"terminal","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"effort":{"allOf":[{"$ref":"#/definitions/Effort"}],"default":"high"},"kind":{"const":"codex","type":"string"},"model":{"default":"gpt-6.1-sol","type":"string"},"permissions":{"allOf":[{"$ref":"#/definitions/Permissions"}],"default":"yolo"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"argv":{"items":{"type":"string"},"type":"array"},"kind":{"const":"program","type":"string"}},"required":["kind","argv"],"type":"object"}]},"Node":{"oneOf":[{"additionalProperties":false,"properties":{"children":{"items":{"$ref":"#/definitions/Node"},"type":"array"},"kind":{"const":"row","type":"string"},"size":{"allOf":[{"$ref":"#/definitions/Size"}],"default":{"kind":"fill"}}},"required":["kind","children"],"type":"object"},{"additionalProperties":false,"properties":{"children":{"items":{"$ref":"#/definitions/Node"},"type":"array"},"kind":{"const":"column","type":"string"},"size":{"allOf":[{"$ref":"#/definitions/Size"}],"default":{"kind":"fill"}}},"required":["kind","children"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"block","type":"string"},"region":{"$ref":"#/definitions/Region"},"size":{"allOf":[{"$ref":"#/definitions/Size"}],"default":{"kind":"fill"}}},"required":["kind","region"],"type":"object"}]},"Permissions":{"enum":["yolo","workspace-write","read-only"],"type":"string"},"PortalMode":{"enum":["overlay","make-room"],"type":"string"},"Region":{"enum":["sidebar","fleet-strip","active-fleet","portals","context-bar"],"type":"string"},"RenameTarget":{"oneOf":[{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]},"Side":{"enum":["left","right","top","bottom"],"type":"string"},"Size":{"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"fill","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"content","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"fixed","type":"string"},"pixels":{"maximum":4096,"minimum":1,"type":"integer"}},"required":["kind","pixels"],"type":"object"}]},"SplitChild":{"enum":["first","second"],"type":"string"},"SplitShare":{"maximum":9999,"minimum":1,"type":"integer"}},"properties":{"action":{"$ref":"#/definitions/Action"},"expectedVersion":{"type":"string"},"requestId":{"type":"string"}},"required":["requestId","expectedVersion","action"],"title":"Request","type":"object"};
const schema103 = {"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"inspect","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"home","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"canvas":{"$ref":"#/definitions/Canvas"},"operation":{"const":"update-canvas","type":"string"}},"required":["operation","canvas"],"type":"object"},{"additionalProperties":false,"properties":{"collapsed":{"type":"boolean"},"operation":{"const":"set-sidebar","type":"string"}},"required":["operation","collapsed"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"name":{"type":"string"},"operation":{"const":"save-layout","type":"string"}},"required":["operation","fleet","name"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"name":{"type":"string"},"operation":{"const":"load-layout","type":"string"}},"required":["operation","fleet","name"],"type":"object"},{"additionalProperties":false,"properties":{"cwd":{"type":"string"},"name":{"type":"string"},"operation":{"const":"create-voyage","type":"string"}},"required":["operation","name","cwd"],"type":"object"},{"additionalProperties":false,"properties":{"name":{"type":"string"},"operation":{"const":"create-fleet","type":"string"},"voyage":{"type":"string"}},"required":["operation","voyage","name"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"create-portal","type":"string"},"voyage":{"type":"string"}},"required":["operation","voyage"],"type":"object"},{"additionalProperties":false,"properties":{"destination":{"$ref":"#/definitions/ContentDestination"},"launch":{"anyOf":[{"$ref":"#/definitions/Launch"},{"type":"null"}]},"operation":{"const":"create-content","type":"string"},"typeId":{"type":"string"}},"required":["operation","typeId","destination"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"remove-content-package","type":"string"},"typeId":{"type":"string"}},"required":["operation","typeId"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"restore-content-package","type":"string"},"typeId":{"type":"string"}},"required":["operation","typeId"],"type":"object"},{"additionalProperties":false,"properties":{"name":{"type":"string"},"operation":{"const":"rename","type":"string"},"target":{"$ref":"#/definitions/RenameTarget"}},"required":["operation","target","name"],"type":"object"},{"additionalProperties":false,"properties":{"after":{"type":"string"},"axis":{"$ref":"#/definitions/Axis"},"fleet":{"type":"string"},"operation":{"const":"split","type":"string"}},"required":["operation","fleet","after","axis"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"operation":{"const":"resize-split","type":"string"},"path":{"items":{"$ref":"#/definitions/SplitChild"},"maxItems":128,"type":"array"},"share":{"$ref":"#/definitions/SplitShare"}},"required":["operation","fleet","path","share"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"move-vessel","type":"string"},"side":{"$ref":"#/definitions/Side"},"target":{"type":"string"}},"required":["operation","id","target","side"],"type":"object"},{"additionalProperties":false,"properties":{"before":{"type":"boolean"},"id":{"type":"string"},"operation":{"const":"move-voyage","type":"string"},"target":{"type":"string"}},"required":["operation","id","target","before"],"type":"object"},{"additionalProperties":false,"properties":{"before":{"type":"boolean"},"id":{"type":"string"},"operation":{"const":"move-fleet","type":"string"},"target":{"type":"string"}},"required":["operation","id","target","before"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"select-voyage","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"select-fleet","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"reveal-vessel","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"context":{"$ref":"#/definitions/Context"},"operation":{"const":"dock","type":"string"}},"required":["operation","context"],"type":"object"}]};
const schema116 = {"oneOf":[{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]};
const schema112 = {"enum":["horizontal","vertical"],"type":"string"};
const schema118 = {"enum":["first","second"],"type":"string"};
const schema119 = {"maximum":9999,"minimum":1,"type":"integer"};
const schema120 = {"enum":["left","right","top","bottom"],"type":"string"};
const schema121 = {"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"workspace","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]};
const schema104 = {"additionalProperties":false,"properties":{"portalMode":{"allOf":[{"$ref":"#/definitions/PortalMode"}],"default":"overlay"},"root":{"$ref":"#/definitions/Node"},"sidebarCollapsed":{"default":false,"type":"boolean"}},"required":["root"],"type":"object"};
const schema105 = {"enum":["overlay","make-room"],"type":"string"};
const schema106 = {"oneOf":[{"additionalProperties":false,"properties":{"children":{"items":{"$ref":"#/definitions/Node"},"type":"array"},"kind":{"const":"row","type":"string"},"size":{"allOf":[{"$ref":"#/definitions/Size"}],"default":{"kind":"fill"}}},"required":["kind","children"],"type":"object"},{"additionalProperties":false,"properties":{"children":{"items":{"$ref":"#/definitions/Node"},"type":"array"},"kind":{"const":"column","type":"string"},"size":{"allOf":[{"$ref":"#/definitions/Size"}],"default":{"kind":"fill"}}},"required":["kind","children"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"block","type":"string"},"region":{"$ref":"#/definitions/Region"},"size":{"allOf":[{"$ref":"#/definitions/Size"}],"default":{"kind":"fill"}}},"required":["kind","region"],"type":"object"}]};
const schema107 = {"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"fill","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"content","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"fixed","type":"string"},"pixels":{"maximum":4096,"minimum":1,"type":"integer"}},"required":["kind","pixels"],"type":"object"}]};
const schema109 = {"enum":["sidebar","fleet-strip","active-fleet","portals","context-bar"],"type":"string"};
const wrapper4 = {validate: validate61};

function validate61(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(errors === _errs1){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((data.kind === undefined) && (missing0 = "kind")) || ((data.children === undefined) && (missing0 = "children"))){
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
if(!(((key0 === "children") || (key0 === "kind")) || (key0 === "size"))){
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
if(data.children !== undefined){
let data0 = data.children;
const _errs4 = errors;
if(errors === _errs4){
if(Array.isArray(data0)){
var valid2 = true;
const len0 = data0.length;
for(let i0=0; i0<len0; i0++){
const _errs6 = errors;
if(!(wrapper4.validate(data0[i0], {instancePath:instancePath+"/children/" + i0,parentData:data0,parentDataProperty:i0,rootData}))){
vErrors = vErrors === null ? wrapper4.validate.errors : vErrors.concat(wrapper4.validate.errors);
errors = vErrors.length;
}
var valid2 = _errs6 === errors;
if(!valid2){
break;
}
}
}
else {
const err2 = {instancePath:instancePath+"/children",schemaPath:"#/oneOf/0/properties/children/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
var valid1 = _errs4 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.kind !== undefined){
let data2 = data.kind;
const _errs7 = errors;
if(typeof data2 !== "string"){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if("row" !== data2){
const err4 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "row"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
var valid1 = _errs7 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.size !== undefined){
let data3 = data.size;
const _errs9 = errors;
const _errs12 = errors;
let valid5 = false;
let passing1 = null;
const _errs13 = errors;
if(errors === _errs13){
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
let missing1;
if((data3.kind === undefined) && (missing1 = "kind")){
const err5 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
else {
const _errs15 = errors;
for(const key1 in data3){
if(!(key1 === "kind")){
const err6 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
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
if(_errs15 === errors){
if(data3.kind !== undefined){
let data4 = data3.kind;
if(typeof data4 !== "string"){
const err7 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if("fill" !== data4){
const err8 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "fill"},message:"must be equal to constant"};
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
const err9 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
var _valid1 = _errs13 === errors;
if(_valid1){
valid5 = true;
passing1 = 0;
}
const _errs18 = errors;
if(errors === _errs18){
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
let missing2;
if((data3.kind === undefined) && (missing2 = "kind")){
const err10 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
else {
const _errs20 = errors;
for(const key2 in data3){
if(!(key2 === "kind")){
const err11 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
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
if(_errs20 === errors){
if(data3.kind !== undefined){
let data5 = data3.kind;
if(typeof data5 !== "string"){
const err12 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if("content" !== data5){
const err13 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "content"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
}
}
else {
const err14 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
var _valid1 = _errs18 === errors;
if(_valid1 && valid5){
valid5 = false;
passing1 = [passing1, 1];
}
else {
if(_valid1){
valid5 = true;
passing1 = 1;
}
const _errs23 = errors;
if(errors === _errs23){
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
let missing3;
if(((data3.kind === undefined) && (missing3 = "kind")) || ((data3.pixels === undefined) && (missing3 = "pixels"))){
const err15 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/required",keyword:"required",params:{missingProperty: missing3},message:"must have required property '"+missing3+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
else {
const _errs25 = errors;
for(const key3 in data3){
if(!((key3 === "kind") || (key3 === "pixels"))){
const err16 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
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
if(_errs25 === errors){
if(data3.kind !== undefined){
let data6 = data3.kind;
const _errs26 = errors;
if(typeof data6 !== "string"){
const err17 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if("fixed" !== data6){
const err18 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "fixed"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
var valid8 = _errs26 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data3.pixels !== undefined){
let data7 = data3.pixels;
const _errs28 = errors;
if(!(((typeof data7 == "number") && (!(data7 % 1) && !isNaN(data7))) && (isFinite(data7)))){
const err19 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(errors === _errs28){
if((typeof data7 == "number") && (isFinite(data7))){
if(data7 > 4096 || isNaN(data7)){
const err20 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/maximum",keyword:"maximum",params:{comparison: "<=", limit: 4096},message:"must be <= 4096"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
else {
if(data7 < 1 || isNaN(data7)){
const err21 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
}
}
var valid8 = _errs28 === errors;
}
else {
var valid8 = true;
}
}
}
}
}
else {
const err22 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
var _valid1 = _errs23 === errors;
if(_valid1 && valid5){
valid5 = false;
passing1 = [passing1, 2];
}
else {
if(_valid1){
valid5 = true;
passing1 = 2;
}
}
}
if(!valid5){
const err23 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf",keyword:"oneOf",params:{passingSchemas: passing1},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
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
var valid1 = _errs9 === errors;
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
const err24 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
}
const _errs30 = errors;
if(errors === _errs30){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing4;
if(((data.kind === undefined) && (missing4 = "kind")) || ((data.children === undefined) && (missing4 = "children"))){
const err25 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: missing4},message:"must have required property '"+missing4+"'"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
else {
const _errs32 = errors;
for(const key4 in data){
if(!(((key4 === "children") || (key4 === "kind")) || (key4 === "size"))){
const err26 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
break;
}
}
if(_errs32 === errors){
if(data.children !== undefined){
let data8 = data.children;
const _errs33 = errors;
if(errors === _errs33){
if(Array.isArray(data8)){
var valid10 = true;
const len1 = data8.length;
for(let i1=0; i1<len1; i1++){
const _errs35 = errors;
if(!(wrapper4.validate(data8[i1], {instancePath:instancePath+"/children/" + i1,parentData:data8,parentDataProperty:i1,rootData}))){
vErrors = vErrors === null ? wrapper4.validate.errors : vErrors.concat(wrapper4.validate.errors);
errors = vErrors.length;
}
var valid10 = _errs35 === errors;
if(!valid10){
break;
}
}
}
else {
const err27 = {instancePath:instancePath+"/children",schemaPath:"#/oneOf/1/properties/children/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
var valid9 = _errs33 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data.kind !== undefined){
let data10 = data.kind;
const _errs36 = errors;
if(typeof data10 !== "string"){
const err28 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if("column" !== data10){
const err29 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "column"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
var valid9 = _errs36 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data.size !== undefined){
let data11 = data.size;
const _errs38 = errors;
const _errs41 = errors;
let valid13 = false;
let passing2 = null;
const _errs42 = errors;
if(errors === _errs42){
if(data11 && typeof data11 == "object" && !Array.isArray(data11)){
let missing5;
if((data11.kind === undefined) && (missing5 = "kind")){
const err30 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/required",keyword:"required",params:{missingProperty: missing5},message:"must have required property '"+missing5+"'"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
else {
const _errs44 = errors;
for(const key5 in data11){
if(!(key5 === "kind")){
const err31 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
break;
}
}
if(_errs44 === errors){
if(data11.kind !== undefined){
let data12 = data11.kind;
if(typeof data12 !== "string"){
const err32 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
if("fill" !== data12){
const err33 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "fill"},message:"must be equal to constant"};
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
}
else {
const err34 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
var _valid2 = _errs42 === errors;
if(_valid2){
valid13 = true;
passing2 = 0;
}
const _errs47 = errors;
if(errors === _errs47){
if(data11 && typeof data11 == "object" && !Array.isArray(data11)){
let missing6;
if((data11.kind === undefined) && (missing6 = "kind")){
const err35 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/required",keyword:"required",params:{missingProperty: missing6},message:"must have required property '"+missing6+"'"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
else {
const _errs49 = errors;
for(const key6 in data11){
if(!(key6 === "kind")){
const err36 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
break;
}
}
if(_errs49 === errors){
if(data11.kind !== undefined){
let data13 = data11.kind;
if(typeof data13 !== "string"){
const err37 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
if("content" !== data13){
const err38 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "content"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
}
}
}
else {
const err39 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
var _valid2 = _errs47 === errors;
if(_valid2 && valid13){
valid13 = false;
passing2 = [passing2, 1];
}
else {
if(_valid2){
valid13 = true;
passing2 = 1;
}
const _errs52 = errors;
if(errors === _errs52){
if(data11 && typeof data11 == "object" && !Array.isArray(data11)){
let missing7;
if(((data11.kind === undefined) && (missing7 = "kind")) || ((data11.pixels === undefined) && (missing7 = "pixels"))){
const err40 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/required",keyword:"required",params:{missingProperty: missing7},message:"must have required property '"+missing7+"'"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
else {
const _errs54 = errors;
for(const key7 in data11){
if(!((key7 === "kind") || (key7 === "pixels"))){
const err41 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key7},message:"must NOT have additional properties"};
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
if(_errs54 === errors){
if(data11.kind !== undefined){
let data14 = data11.kind;
const _errs55 = errors;
if(typeof data14 !== "string"){
const err42 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
if("fixed" !== data14){
const err43 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "fixed"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
var valid16 = _errs55 === errors;
}
else {
var valid16 = true;
}
if(valid16){
if(data11.pixels !== undefined){
let data15 = data11.pixels;
const _errs57 = errors;
if(!(((typeof data15 == "number") && (!(data15 % 1) && !isNaN(data15))) && (isFinite(data15)))){
const err44 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
if(errors === _errs57){
if((typeof data15 == "number") && (isFinite(data15))){
if(data15 > 4096 || isNaN(data15)){
const err45 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/maximum",keyword:"maximum",params:{comparison: "<=", limit: 4096},message:"must be <= 4096"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
else {
if(data15 < 1 || isNaN(data15)){
const err46 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
}
}
var valid16 = _errs57 === errors;
}
else {
var valid16 = true;
}
}
}
}
}
else {
const err47 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
}
var _valid2 = _errs52 === errors;
if(_valid2 && valid13){
valid13 = false;
passing2 = [passing2, 2];
}
else {
if(_valid2){
valid13 = true;
passing2 = 2;
}
}
}
if(!valid13){
const err48 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf",keyword:"oneOf",params:{passingSchemas: passing2},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
else {
errors = _errs41;
if(vErrors !== null){
if(_errs41){
vErrors.length = _errs41;
}
else {
vErrors = null;
}
}
}
var valid9 = _errs38 === errors;
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
const err49 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
var _valid0 = _errs30 === errors;
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
let missing8;
if(((data.kind === undefined) && (missing8 = "kind")) || ((data.region === undefined) && (missing8 = "region"))){
const err50 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: missing8},message:"must have required property '"+missing8+"'"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
else {
const _errs61 = errors;
for(const key8 in data){
if(!(((key8 === "kind") || (key8 === "region")) || (key8 === "size"))){
const err51 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key8},message:"must NOT have additional properties"};
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
if(_errs61 === errors){
if(data.kind !== undefined){
let data16 = data.kind;
const _errs62 = errors;
if(typeof data16 !== "string"){
const err52 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
if("block" !== data16){
const err53 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "block"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
var valid17 = _errs62 === errors;
}
else {
var valid17 = true;
}
if(valid17){
if(data.region !== undefined){
let data17 = data.region;
const _errs64 = errors;
if(typeof data17 !== "string"){
const err54 = {instancePath:instancePath+"/region",schemaPath:"#/definitions/Region/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
if(!(((((data17 === "sidebar") || (data17 === "fleet-strip")) || (data17 === "active-fleet")) || (data17 === "portals")) || (data17 === "context-bar"))){
const err55 = {instancePath:instancePath+"/region",schemaPath:"#/definitions/Region/enum",keyword:"enum",params:{allowedValues: schema109.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
var valid17 = _errs64 === errors;
}
else {
var valid17 = true;
}
if(valid17){
if(data.size !== undefined){
let data18 = data.size;
const _errs67 = errors;
const _errs70 = errors;
let valid21 = false;
let passing3 = null;
const _errs71 = errors;
if(errors === _errs71){
if(data18 && typeof data18 == "object" && !Array.isArray(data18)){
let missing9;
if((data18.kind === undefined) && (missing9 = "kind")){
const err56 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/required",keyword:"required",params:{missingProperty: missing9},message:"must have required property '"+missing9+"'"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
else {
const _errs73 = errors;
for(const key9 in data18){
if(!(key9 === "kind")){
const err57 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key9},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
break;
}
}
if(_errs73 === errors){
if(data18.kind !== undefined){
let data19 = data18.kind;
if(typeof data19 !== "string"){
const err58 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
if("fill" !== data19){
const err59 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "fill"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
}
}
}
}
else {
const err60 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
var _valid3 = _errs71 === errors;
if(_valid3){
valid21 = true;
passing3 = 0;
}
const _errs76 = errors;
if(errors === _errs76){
if(data18 && typeof data18 == "object" && !Array.isArray(data18)){
let missing10;
if((data18.kind === undefined) && (missing10 = "kind")){
const err61 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/required",keyword:"required",params:{missingProperty: missing10},message:"must have required property '"+missing10+"'"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
else {
const _errs78 = errors;
for(const key10 in data18){
if(!(key10 === "kind")){
const err62 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key10},message:"must NOT have additional properties"};
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
if(_errs78 === errors){
if(data18.kind !== undefined){
let data20 = data18.kind;
if(typeof data20 !== "string"){
const err63 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
if("content" !== data20){
const err64 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "content"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
}
}
}
}
else {
const err65 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
}
var _valid3 = _errs76 === errors;
if(_valid3 && valid21){
valid21 = false;
passing3 = [passing3, 1];
}
else {
if(_valid3){
valid21 = true;
passing3 = 1;
}
const _errs81 = errors;
if(errors === _errs81){
if(data18 && typeof data18 == "object" && !Array.isArray(data18)){
let missing11;
if(((data18.kind === undefined) && (missing11 = "kind")) || ((data18.pixels === undefined) && (missing11 = "pixels"))){
const err66 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/required",keyword:"required",params:{missingProperty: missing11},message:"must have required property '"+missing11+"'"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
else {
const _errs83 = errors;
for(const key11 in data18){
if(!((key11 === "kind") || (key11 === "pixels"))){
const err67 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key11},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
break;
}
}
if(_errs83 === errors){
if(data18.kind !== undefined){
let data21 = data18.kind;
const _errs84 = errors;
if(typeof data21 !== "string"){
const err68 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
if("fixed" !== data21){
const err69 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "fixed"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
var valid24 = _errs84 === errors;
}
else {
var valid24 = true;
}
if(valid24){
if(data18.pixels !== undefined){
let data22 = data18.pixels;
const _errs86 = errors;
if(!(((typeof data22 == "number") && (!(data22 % 1) && !isNaN(data22))) && (isFinite(data22)))){
const err70 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
if(errors === _errs86){
if((typeof data22 == "number") && (isFinite(data22))){
if(data22 > 4096 || isNaN(data22)){
const err71 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/maximum",keyword:"maximum",params:{comparison: "<=", limit: 4096},message:"must be <= 4096"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
else {
if(data22 < 1 || isNaN(data22)){
const err72 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
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
var valid24 = _errs86 === errors;
}
else {
var valid24 = true;
}
}
}
}
}
else {
const err73 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
}
var _valid3 = _errs81 === errors;
if(_valid3 && valid21){
valid21 = false;
passing3 = [passing3, 2];
}
else {
if(_valid3){
valid21 = true;
passing3 = 2;
}
}
}
if(!valid21){
const err74 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf",keyword:"oneOf",params:{passingSchemas: passing3},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
else {
errors = _errs70;
if(vErrors !== null){
if(_errs70){
vErrors.length = _errs70;
}
else {
vErrors = null;
}
}
}
var valid17 = _errs67 === errors;
}
else {
var valid17 = true;
}
}
}
}
}
}
else {
const err75 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
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
}
}
if(!valid0){
const err76 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
validate61.errors = vErrors;
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
validate61.errors = vErrors;
return errors === 0;
}


function validate60(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((data.root === undefined) && (missing0 = "root")){
validate60.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(((key0 === "portalMode") || (key0 === "root")) || (key0 === "sidebarCollapsed"))){
validate60.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.portalMode !== undefined){
let data0 = data.portalMode;
const _errs2 = errors;
if(typeof data0 !== "string"){
validate60.errors = [{instancePath:instancePath+"/portalMode",schemaPath:"#/definitions/PortalMode/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!((data0 === "overlay") || (data0 === "make-room"))){
validate60.errors = [{instancePath:instancePath+"/portalMode",schemaPath:"#/definitions/PortalMode/enum",keyword:"enum",params:{allowedValues: schema105.enum},message:"must be equal to one of the allowed values"}];
return false;
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.root !== undefined){
const _errs6 = errors;
if(!(validate61(data.root, {instancePath:instancePath+"/root",parentData:data,parentDataProperty:"root",rootData}))){
vErrors = vErrors === null ? validate61.errors : vErrors.concat(validate61.errors);
errors = vErrors.length;
}
var valid0 = _errs6 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.sidebarCollapsed !== undefined){
const _errs7 = errors;
if(typeof data.sidebarCollapsed !== "boolean"){
validate60.errors = [{instancePath:instancePath+"/sidebarCollapsed",schemaPath:"#/properties/sidebarCollapsed/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"}];
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
validate60.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate60.errors = vErrors;
return errors === 0;
}

const schema111 = {"oneOf":[{"additionalProperties":false,"properties":{"after":{"type":"string"},"axis":{"$ref":"#/definitions/Axis"},"fleet":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","fleet","after","axis"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"portal","type":"string"},"voyage":{"type":"string"}},"required":["kind","voyage"],"type":"object"}]};

function validate64(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
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
const err4 = {instancePath:instancePath+"/axis",schemaPath:"#/definitions/Axis/enum",keyword:"enum",params:{allowedValues: schema112.enum},message:"must be equal to one of the allowed values"};
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
validate64.errors = vErrors;
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
validate64.errors = vErrors;
return errors === 0;
}

const schema113 = {"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"terminal","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"effort":{"allOf":[{"$ref":"#/definitions/Effort"}],"default":"high"},"kind":{"const":"codex","type":"string"},"model":{"default":"gpt-6.1-sol","type":"string"},"permissions":{"allOf":[{"$ref":"#/definitions/Permissions"}],"default":"yolo"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"argv":{"items":{"type":"string"},"type":"array"},"kind":{"const":"program","type":"string"}},"required":["kind","argv"],"type":"object"}]};
const schema114 = {"enum":["low","medium","high","xhigh","max","ultra"],"type":"string"};
const schema115 = {"enum":["yolo","workspace-write","read-only"],"type":"string"};

function validate66(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(errors === _errs1){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((data.kind === undefined) && (missing0 = "kind")){
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
if(!(key0 === "kind")){
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
if("terminal" !== data0){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "terminal"},message:"must be equal to constant"};
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
if((data.kind === undefined) && (missing1 = "kind")){
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
if(!((((key1 === "effort") || (key1 === "kind")) || (key1 === "model")) || (key1 === "permissions"))){
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
if(data.effort !== undefined){
let data1 = data.effort;
const _errs9 = errors;
if(typeof data1 !== "string"){
const err7 = {instancePath:instancePath+"/effort",schemaPath:"#/definitions/Effort/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(!((((((data1 === "low") || (data1 === "medium")) || (data1 === "high")) || (data1 === "xhigh")) || (data1 === "max")) || (data1 === "ultra"))){
const err8 = {instancePath:instancePath+"/effort",schemaPath:"#/definitions/Effort/enum",keyword:"enum",params:{allowedValues: schema114.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
var valid2 = _errs9 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data.kind !== undefined){
let data2 = data.kind;
const _errs13 = errors;
if(typeof data2 !== "string"){
const err9 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if("codex" !== data2){
const err10 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "codex"},message:"must be equal to constant"};
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
if(valid2){
if(data.model !== undefined){
const _errs15 = errors;
if(typeof data.model !== "string"){
const err11 = {instancePath:instancePath+"/model",schemaPath:"#/oneOf/1/properties/model/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
if(data.permissions !== undefined){
let data4 = data.permissions;
const _errs17 = errors;
if(typeof data4 !== "string"){
const err12 = {instancePath:instancePath+"/permissions",schemaPath:"#/definitions/Permissions/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(!(((data4 === "yolo") || (data4 === "workspace-write")) || (data4 === "read-only"))){
const err13 = {instancePath:instancePath+"/permissions",schemaPath:"#/definitions/Permissions/enum",keyword:"enum",params:{allowedValues: schema115.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
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
const _errs21 = errors;
if(errors === _errs21){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing2;
if(((data.kind === undefined) && (missing2 = "kind")) || ((data.argv === undefined) && (missing2 = "argv"))){
const err15 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"};
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
for(const key2 in data){
if(!((key2 === "argv") || (key2 === "kind"))){
const err16 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
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
if(data.argv !== undefined){
let data5 = data.argv;
const _errs24 = errors;
if(errors === _errs24){
if(Array.isArray(data5)){
var valid8 = true;
const len0 = data5.length;
for(let i0=0; i0<len0; i0++){
const _errs26 = errors;
if(typeof data5[i0] !== "string"){
const err17 = {instancePath:instancePath+"/argv/" + i0,schemaPath:"#/oneOf/2/properties/argv/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
var valid8 = _errs26 === errors;
if(!valid8){
break;
}
}
}
else {
const err18 = {instancePath:instancePath+"/argv",schemaPath:"#/oneOf/2/properties/argv/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
var valid7 = _errs24 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data.kind !== undefined){
let data7 = data.kind;
const _errs28 = errors;
if(typeof data7 !== "string"){
const err19 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if("program" !== data7){
const err20 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "program"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
var valid7 = _errs28 === errors;
}
else {
var valid7 = true;
}
}
}
}
}
else {
const err21 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
var _valid0 = _errs21 === errors;
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
const err22 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
validate66.errors = vErrors;
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
validate66.errors = vErrors;
return errors === 0;
}


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
if(((data.operation === undefined) && (missing2 = "operation")) || ((data.canvas === undefined) && (missing2 = "canvas"))){
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
if(!((key2 === "canvas") || (key2 === "operation"))){
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
if(data.canvas !== undefined){
const _errs14 = errors;
if(!(validate60(data.canvas, {instancePath:instancePath+"/canvas",parentData:data,parentDataProperty:"canvas",rootData}))){
vErrors = vErrors === null ? validate60.errors : vErrors.concat(validate60.errors);
errors = vErrors.length;
}
var valid3 = _errs14 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data.operation !== undefined){
let data3 = data.operation;
const _errs15 = errors;
if(typeof data3 !== "string"){
const err12 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/2/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if("update-canvas" !== data3){
const err13 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/2/properties/operation/const",keyword:"const",params:{allowedValue: "update-canvas"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
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
const err14 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
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
const _errs17 = errors;
if(errors === _errs17){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing3;
if(((data.operation === undefined) && (missing3 = "operation")) || ((data.collapsed === undefined) && (missing3 = "collapsed"))){
const err15 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: missing3},message:"must have required property '"+missing3+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
else {
const _errs19 = errors;
for(const key3 in data){
if(!((key3 === "collapsed") || (key3 === "operation"))){
const err16 = {instancePath,schemaPath:"#/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
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
if(_errs19 === errors){
if(data.collapsed !== undefined){
const _errs20 = errors;
if(typeof data.collapsed !== "boolean"){
const err17 = {instancePath:instancePath+"/collapsed",schemaPath:"#/oneOf/3/properties/collapsed/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
var valid4 = _errs20 === errors;
}
else {
var valid4 = true;
}
if(valid4){
if(data.operation !== undefined){
let data5 = data.operation;
const _errs22 = errors;
if(typeof data5 !== "string"){
const err18 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/3/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if("set-sidebar" !== data5){
const err19 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/3/properties/operation/const",keyword:"const",params:{allowedValue: "set-sidebar"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
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
else {
const err20 = {instancePath,schemaPath:"#/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
var _valid0 = _errs17 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid0 = true;
passing0 = 3;
}
const _errs24 = errors;
if(errors === _errs24){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing4;
if((((data.operation === undefined) && (missing4 = "operation")) || ((data.fleet === undefined) && (missing4 = "fleet"))) || ((data.name === undefined) && (missing4 = "name"))){
const err21 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: missing4},message:"must have required property '"+missing4+"'"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
else {
const _errs26 = errors;
for(const key4 in data){
if(!(((key4 === "fleet") || (key4 === "name")) || (key4 === "operation"))){
const err22 = {instancePath,schemaPath:"#/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
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
if(_errs26 === errors){
if(data.fleet !== undefined){
const _errs27 = errors;
if(typeof data.fleet !== "string"){
const err23 = {instancePath:instancePath+"/fleet",schemaPath:"#/oneOf/4/properties/fleet/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
var valid5 = _errs27 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data.name !== undefined){
const _errs29 = errors;
if(typeof data.name !== "string"){
const err24 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/4/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
var valid5 = _errs29 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data.operation !== undefined){
let data8 = data.operation;
const _errs31 = errors;
if(typeof data8 !== "string"){
const err25 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/4/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if("save-layout" !== data8){
const err26 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/4/properties/operation/const",keyword:"const",params:{allowedValue: "save-layout"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
var valid5 = _errs31 === errors;
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
const err27 = {instancePath,schemaPath:"#/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
passing0 = [passing0, 4];
}
else {
if(_valid0){
valid0 = true;
passing0 = 4;
}
const _errs33 = errors;
if(errors === _errs33){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing5;
if((((data.operation === undefined) && (missing5 = "operation")) || ((data.fleet === undefined) && (missing5 = "fleet"))) || ((data.name === undefined) && (missing5 = "name"))){
const err28 = {instancePath,schemaPath:"#/oneOf/5/required",keyword:"required",params:{missingProperty: missing5},message:"must have required property '"+missing5+"'"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
else {
const _errs35 = errors;
for(const key5 in data){
if(!(((key5 === "fleet") || (key5 === "name")) || (key5 === "operation"))){
const err29 = {instancePath,schemaPath:"#/oneOf/5/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
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
if(_errs35 === errors){
if(data.fleet !== undefined){
const _errs36 = errors;
if(typeof data.fleet !== "string"){
const err30 = {instancePath:instancePath+"/fleet",schemaPath:"#/oneOf/5/properties/fleet/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
var valid6 = _errs36 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data.name !== undefined){
const _errs38 = errors;
if(typeof data.name !== "string"){
const err31 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/5/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
var valid6 = _errs38 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data.operation !== undefined){
let data11 = data.operation;
const _errs40 = errors;
if(typeof data11 !== "string"){
const err32 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/5/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
if("load-layout" !== data11){
const err33 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/5/properties/operation/const",keyword:"const",params:{allowedValue: "load-layout"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
var valid6 = _errs40 === errors;
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
const err34 = {instancePath,schemaPath:"#/oneOf/5/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
var _valid0 = _errs33 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 5];
}
else {
if(_valid0){
valid0 = true;
passing0 = 5;
}
const _errs42 = errors;
if(errors === _errs42){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing6;
if((((data.operation === undefined) && (missing6 = "operation")) || ((data.name === undefined) && (missing6 = "name"))) || ((data.cwd === undefined) && (missing6 = "cwd"))){
const err35 = {instancePath,schemaPath:"#/oneOf/6/required",keyword:"required",params:{missingProperty: missing6},message:"must have required property '"+missing6+"'"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
else {
const _errs44 = errors;
for(const key6 in data){
if(!(((key6 === "cwd") || (key6 === "name")) || (key6 === "operation"))){
const err36 = {instancePath,schemaPath:"#/oneOf/6/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
break;
}
}
if(_errs44 === errors){
if(data.cwd !== undefined){
const _errs45 = errors;
if(typeof data.cwd !== "string"){
const err37 = {instancePath:instancePath+"/cwd",schemaPath:"#/oneOf/6/properties/cwd/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
var valid7 = _errs45 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data.name !== undefined){
const _errs47 = errors;
if(typeof data.name !== "string"){
const err38 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/6/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
var valid7 = _errs47 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data.operation !== undefined){
let data14 = data.operation;
const _errs49 = errors;
if(typeof data14 !== "string"){
const err39 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/6/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
if("create-voyage" !== data14){
const err40 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/6/properties/operation/const",keyword:"const",params:{allowedValue: "create-voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
var valid7 = _errs49 === errors;
}
else {
var valid7 = true;
}
}
}
}
}
}
else {
const err41 = {instancePath,schemaPath:"#/oneOf/6/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
var _valid0 = _errs42 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 6];
}
else {
if(_valid0){
valid0 = true;
passing0 = 6;
}
const _errs51 = errors;
if(errors === _errs51){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing7;
if((((data.operation === undefined) && (missing7 = "operation")) || ((data.voyage === undefined) && (missing7 = "voyage"))) || ((data.name === undefined) && (missing7 = "name"))){
const err42 = {instancePath,schemaPath:"#/oneOf/7/required",keyword:"required",params:{missingProperty: missing7},message:"must have required property '"+missing7+"'"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
else {
const _errs53 = errors;
for(const key7 in data){
if(!(((key7 === "name") || (key7 === "operation")) || (key7 === "voyage"))){
const err43 = {instancePath,schemaPath:"#/oneOf/7/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key7},message:"must NOT have additional properties"};
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
if(_errs53 === errors){
if(data.name !== undefined){
const _errs54 = errors;
if(typeof data.name !== "string"){
const err44 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/7/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
var valid8 = _errs54 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data.operation !== undefined){
let data16 = data.operation;
const _errs56 = errors;
if(typeof data16 !== "string"){
const err45 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/7/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
if("create-fleet" !== data16){
const err46 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/7/properties/operation/const",keyword:"const",params:{allowedValue: "create-fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
var valid8 = _errs56 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data.voyage !== undefined){
const _errs58 = errors;
if(typeof data.voyage !== "string"){
const err47 = {instancePath:instancePath+"/voyage",schemaPath:"#/oneOf/7/properties/voyage/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
}
}
}
}
}
else {
const err48 = {instancePath,schemaPath:"#/oneOf/7/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
var _valid0 = _errs51 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 7];
}
else {
if(_valid0){
valid0 = true;
passing0 = 7;
}
const _errs60 = errors;
if(errors === _errs60){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing8;
if(((data.operation === undefined) && (missing8 = "operation")) || ((data.voyage === undefined) && (missing8 = "voyage"))){
const err49 = {instancePath,schemaPath:"#/oneOf/8/required",keyword:"required",params:{missingProperty: missing8},message:"must have required property '"+missing8+"'"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
else {
const _errs62 = errors;
for(const key8 in data){
if(!((key8 === "operation") || (key8 === "voyage"))){
const err50 = {instancePath,schemaPath:"#/oneOf/8/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key8},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
break;
}
}
if(_errs62 === errors){
if(data.operation !== undefined){
let data18 = data.operation;
const _errs63 = errors;
if(typeof data18 !== "string"){
const err51 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/8/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
if("create-portal" !== data18){
const err52 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/8/properties/operation/const",keyword:"const",params:{allowedValue: "create-portal"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
var valid9 = _errs63 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data.voyage !== undefined){
const _errs65 = errors;
if(typeof data.voyage !== "string"){
const err53 = {instancePath:instancePath+"/voyage",schemaPath:"#/oneOf/8/properties/voyage/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
var valid9 = _errs65 === errors;
}
else {
var valid9 = true;
}
}
}
}
}
else {
const err54 = {instancePath,schemaPath:"#/oneOf/8/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
}
var _valid0 = _errs60 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 8];
}
else {
if(_valid0){
valid0 = true;
passing0 = 8;
}
const _errs67 = errors;
if(errors === _errs67){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing9;
if((((data.operation === undefined) && (missing9 = "operation")) || ((data.typeId === undefined) && (missing9 = "typeId"))) || ((data.destination === undefined) && (missing9 = "destination"))){
const err55 = {instancePath,schemaPath:"#/oneOf/9/required",keyword:"required",params:{missingProperty: missing9},message:"must have required property '"+missing9+"'"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
else {
const _errs69 = errors;
for(const key9 in data){
if(!((((key9 === "destination") || (key9 === "launch")) || (key9 === "operation")) || (key9 === "typeId"))){
const err56 = {instancePath,schemaPath:"#/oneOf/9/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key9},message:"must NOT have additional properties"};
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
if(_errs69 === errors){
if(data.destination !== undefined){
const _errs70 = errors;
if(!(validate64(data.destination, {instancePath:instancePath+"/destination",parentData:data,parentDataProperty:"destination",rootData}))){
vErrors = vErrors === null ? validate64.errors : vErrors.concat(validate64.errors);
errors = vErrors.length;
}
var valid10 = _errs70 === errors;
}
else {
var valid10 = true;
}
if(valid10){
if(data.launch !== undefined){
let data21 = data.launch;
const _errs71 = errors;
const _errs72 = errors;
let valid11 = false;
const _errs73 = errors;
if(!(validate66(data21, {instancePath:instancePath+"/launch",parentData:data,parentDataProperty:"launch",rootData}))){
vErrors = vErrors === null ? validate66.errors : vErrors.concat(validate66.errors);
errors = vErrors.length;
}
var _valid1 = _errs73 === errors;
valid11 = valid11 || _valid1;
if(!valid11){
const _errs74 = errors;
if(data21 !== null){
const err57 = {instancePath:instancePath+"/launch",schemaPath:"#/oneOf/9/properties/launch/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
var _valid1 = _errs74 === errors;
valid11 = valid11 || _valid1;
}
if(!valid11){
const err58 = {instancePath:instancePath+"/launch",schemaPath:"#/oneOf/9/properties/launch/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
else {
errors = _errs72;
if(vErrors !== null){
if(_errs72){
vErrors.length = _errs72;
}
else {
vErrors = null;
}
}
}
var valid10 = _errs71 === errors;
}
else {
var valid10 = true;
}
if(valid10){
if(data.operation !== undefined){
let data22 = data.operation;
const _errs76 = errors;
if(typeof data22 !== "string"){
const err59 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/9/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
if("create-content" !== data22){
const err60 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/9/properties/operation/const",keyword:"const",params:{allowedValue: "create-content"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
var valid10 = _errs76 === errors;
}
else {
var valid10 = true;
}
if(valid10){
if(data.typeId !== undefined){
const _errs78 = errors;
if(typeof data.typeId !== "string"){
const err61 = {instancePath:instancePath+"/typeId",schemaPath:"#/oneOf/9/properties/typeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
var valid10 = _errs78 === errors;
}
else {
var valid10 = true;
}
}
}
}
}
}
}
else {
const err62 = {instancePath,schemaPath:"#/oneOf/9/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
}
var _valid0 = _errs67 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 9];
}
else {
if(_valid0){
valid0 = true;
passing0 = 9;
}
const _errs80 = errors;
if(errors === _errs80){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing10;
if(((data.operation === undefined) && (missing10 = "operation")) || ((data.typeId === undefined) && (missing10 = "typeId"))){
const err63 = {instancePath,schemaPath:"#/oneOf/10/required",keyword:"required",params:{missingProperty: missing10},message:"must have required property '"+missing10+"'"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
else {
const _errs82 = errors;
for(const key10 in data){
if(!((key10 === "operation") || (key10 === "typeId"))){
const err64 = {instancePath,schemaPath:"#/oneOf/10/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key10},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
break;
}
}
if(_errs82 === errors){
if(data.operation !== undefined){
let data24 = data.operation;
const _errs83 = errors;
if(typeof data24 !== "string"){
const err65 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/10/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
if("remove-content-package" !== data24){
const err66 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/10/properties/operation/const",keyword:"const",params:{allowedValue: "remove-content-package"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
var valid12 = _errs83 === errors;
}
else {
var valid12 = true;
}
if(valid12){
if(data.typeId !== undefined){
const _errs85 = errors;
if(typeof data.typeId !== "string"){
const err67 = {instancePath:instancePath+"/typeId",schemaPath:"#/oneOf/10/properties/typeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
var valid12 = _errs85 === errors;
}
else {
var valid12 = true;
}
}
}
}
}
else {
const err68 = {instancePath,schemaPath:"#/oneOf/10/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
}
var _valid0 = _errs80 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 10];
}
else {
if(_valid0){
valid0 = true;
passing0 = 10;
}
const _errs87 = errors;
if(errors === _errs87){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing11;
if(((data.operation === undefined) && (missing11 = "operation")) || ((data.typeId === undefined) && (missing11 = "typeId"))){
const err69 = {instancePath,schemaPath:"#/oneOf/11/required",keyword:"required",params:{missingProperty: missing11},message:"must have required property '"+missing11+"'"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
else {
const _errs89 = errors;
for(const key11 in data){
if(!((key11 === "operation") || (key11 === "typeId"))){
const err70 = {instancePath,schemaPath:"#/oneOf/11/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key11},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
break;
}
}
if(_errs89 === errors){
if(data.operation !== undefined){
let data26 = data.operation;
const _errs90 = errors;
if(typeof data26 !== "string"){
const err71 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/11/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
if("restore-content-package" !== data26){
const err72 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/11/properties/operation/const",keyword:"const",params:{allowedValue: "restore-content-package"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
var valid13 = _errs90 === errors;
}
else {
var valid13 = true;
}
if(valid13){
if(data.typeId !== undefined){
const _errs92 = errors;
if(typeof data.typeId !== "string"){
const err73 = {instancePath:instancePath+"/typeId",schemaPath:"#/oneOf/11/properties/typeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
var valid13 = _errs92 === errors;
}
else {
var valid13 = true;
}
}
}
}
}
else {
const err74 = {instancePath,schemaPath:"#/oneOf/11/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
}
var _valid0 = _errs87 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 11];
}
else {
if(_valid0){
valid0 = true;
passing0 = 11;
}
const _errs94 = errors;
if(errors === _errs94){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing12;
if((((data.operation === undefined) && (missing12 = "operation")) || ((data.target === undefined) && (missing12 = "target"))) || ((data.name === undefined) && (missing12 = "name"))){
const err75 = {instancePath,schemaPath:"#/oneOf/12/required",keyword:"required",params:{missingProperty: missing12},message:"must have required property '"+missing12+"'"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
else {
const _errs96 = errors;
for(const key12 in data){
if(!(((key12 === "name") || (key12 === "operation")) || (key12 === "target"))){
const err76 = {instancePath,schemaPath:"#/oneOf/12/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key12},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
break;
}
}
if(_errs96 === errors){
if(data.name !== undefined){
const _errs97 = errors;
if(typeof data.name !== "string"){
const err77 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/12/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
var valid14 = _errs97 === errors;
}
else {
var valid14 = true;
}
if(valid14){
if(data.operation !== undefined){
let data29 = data.operation;
const _errs99 = errors;
if(typeof data29 !== "string"){
const err78 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/12/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
if("rename" !== data29){
const err79 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/12/properties/operation/const",keyword:"const",params:{allowedValue: "rename"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
var valid14 = _errs99 === errors;
}
else {
var valid14 = true;
}
if(valid14){
if(data.target !== undefined){
let data30 = data.target;
const _errs101 = errors;
const _errs103 = errors;
let valid16 = false;
let passing1 = null;
const _errs104 = errors;
if(errors === _errs104){
if(data30 && typeof data30 == "object" && !Array.isArray(data30)){
let missing13;
if(((data30.kind === undefined) && (missing13 = "kind")) || ((data30.id === undefined) && (missing13 = "id"))){
const err80 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/0/required",keyword:"required",params:{missingProperty: missing13},message:"must have required property '"+missing13+"'"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
else {
const _errs106 = errors;
for(const key13 in data30){
if(!((key13 === "id") || (key13 === "kind"))){
const err81 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key13},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
break;
}
}
if(_errs106 === errors){
if(data30.id !== undefined){
const _errs107 = errors;
if(typeof data30.id !== "string"){
const err82 = {instancePath:instancePath+"/target/id",schemaPath:"#/definitions/RenameTarget/oneOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
var valid17 = _errs107 === errors;
}
else {
var valid17 = true;
}
if(valid17){
if(data30.kind !== undefined){
let data32 = data30.kind;
const _errs109 = errors;
if(typeof data32 !== "string"){
const err83 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
if("voyage" !== data32){
const err84 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
var valid17 = _errs109 === errors;
}
else {
var valid17 = true;
}
}
}
}
}
else {
const err85 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
}
var _valid2 = _errs104 === errors;
if(_valid2){
valid16 = true;
passing1 = 0;
}
const _errs111 = errors;
if(errors === _errs111){
if(data30 && typeof data30 == "object" && !Array.isArray(data30)){
let missing14;
if(((data30.kind === undefined) && (missing14 = "kind")) || ((data30.id === undefined) && (missing14 = "id"))){
const err86 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/1/required",keyword:"required",params:{missingProperty: missing14},message:"must have required property '"+missing14+"'"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
else {
const _errs113 = errors;
for(const key14 in data30){
if(!((key14 === "id") || (key14 === "kind"))){
const err87 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key14},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
break;
}
}
if(_errs113 === errors){
if(data30.id !== undefined){
const _errs114 = errors;
if(typeof data30.id !== "string"){
const err88 = {instancePath:instancePath+"/target/id",schemaPath:"#/definitions/RenameTarget/oneOf/1/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
var valid18 = _errs114 === errors;
}
else {
var valid18 = true;
}
if(valid18){
if(data30.kind !== undefined){
let data34 = data30.kind;
const _errs116 = errors;
if(typeof data34 !== "string"){
const err89 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
if("fleet" !== data34){
const err90 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
var valid18 = _errs116 === errors;
}
else {
var valid18 = true;
}
}
}
}
}
else {
const err91 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
}
}
var _valid2 = _errs111 === errors;
if(_valid2 && valid16){
valid16 = false;
passing1 = [passing1, 1];
}
else {
if(_valid2){
valid16 = true;
passing1 = 1;
}
const _errs118 = errors;
if(errors === _errs118){
if(data30 && typeof data30 == "object" && !Array.isArray(data30)){
let missing15;
if(((data30.kind === undefined) && (missing15 = "kind")) || ((data30.id === undefined) && (missing15 = "id"))){
const err92 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/2/required",keyword:"required",params:{missingProperty: missing15},message:"must have required property '"+missing15+"'"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
else {
const _errs120 = errors;
for(const key15 in data30){
if(!((key15 === "id") || (key15 === "kind"))){
const err93 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key15},message:"must NOT have additional properties"};
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
if(_errs120 === errors){
if(data30.id !== undefined){
const _errs121 = errors;
if(typeof data30.id !== "string"){
const err94 = {instancePath:instancePath+"/target/id",schemaPath:"#/definitions/RenameTarget/oneOf/2/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
var valid19 = _errs121 === errors;
}
else {
var valid19 = true;
}
if(valid19){
if(data30.kind !== undefined){
let data36 = data30.kind;
const _errs123 = errors;
if(typeof data36 !== "string"){
const err95 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
if("vessel" !== data36){
const err96 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
var valid19 = _errs123 === errors;
}
else {
var valid19 = true;
}
}
}
}
}
else {
const err97 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
}
var _valid2 = _errs118 === errors;
if(_valid2 && valid16){
valid16 = false;
passing1 = [passing1, 2];
}
else {
if(_valid2){
valid16 = true;
passing1 = 2;
}
const _errs125 = errors;
if(errors === _errs125){
if(data30 && typeof data30 == "object" && !Array.isArray(data30)){
let missing16;
if(((data30.kind === undefined) && (missing16 = "kind")) || ((data30.id === undefined) && (missing16 = "id"))){
const err98 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/3/required",keyword:"required",params:{missingProperty: missing16},message:"must have required property '"+missing16+"'"};
if(vErrors === null){
vErrors = [err98];
}
else {
vErrors.push(err98);
}
errors++;
}
else {
const _errs127 = errors;
for(const key16 in data30){
if(!((key16 === "id") || (key16 === "kind"))){
const err99 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key16},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err99];
}
else {
vErrors.push(err99);
}
errors++;
break;
}
}
if(_errs127 === errors){
if(data30.id !== undefined){
const _errs128 = errors;
if(typeof data30.id !== "string"){
const err100 = {instancePath:instancePath+"/target/id",schemaPath:"#/definitions/RenameTarget/oneOf/3/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err100];
}
else {
vErrors.push(err100);
}
errors++;
}
var valid20 = _errs128 === errors;
}
else {
var valid20 = true;
}
if(valid20){
if(data30.kind !== undefined){
let data38 = data30.kind;
const _errs130 = errors;
if(typeof data38 !== "string"){
const err101 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/3/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err101];
}
else {
vErrors.push(err101);
}
errors++;
}
if("portal" !== data38){
const err102 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/3/properties/kind/const",keyword:"const",params:{allowedValue: "portal"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err102];
}
else {
vErrors.push(err102);
}
errors++;
}
var valid20 = _errs130 === errors;
}
else {
var valid20 = true;
}
}
}
}
}
else {
const err103 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err103];
}
else {
vErrors.push(err103);
}
errors++;
}
}
var _valid2 = _errs125 === errors;
if(_valid2 && valid16){
valid16 = false;
passing1 = [passing1, 3];
}
else {
if(_valid2){
valid16 = true;
passing1 = 3;
}
}
}
}
if(!valid16){
const err104 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf",keyword:"oneOf",params:{passingSchemas: passing1},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err104];
}
else {
vErrors.push(err104);
}
errors++;
}
else {
errors = _errs103;
if(vErrors !== null){
if(_errs103){
vErrors.length = _errs103;
}
else {
vErrors = null;
}
}
}
var valid14 = _errs101 === errors;
}
else {
var valid14 = true;
}
}
}
}
}
}
else {
const err105 = {instancePath,schemaPath:"#/oneOf/12/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err105];
}
else {
vErrors.push(err105);
}
errors++;
}
}
var _valid0 = _errs94 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 12];
}
else {
if(_valid0){
valid0 = true;
passing0 = 12;
}
const _errs132 = errors;
if(errors === _errs132){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing17;
if(((((data.operation === undefined) && (missing17 = "operation")) || ((data.fleet === undefined) && (missing17 = "fleet"))) || ((data.after === undefined) && (missing17 = "after"))) || ((data.axis === undefined) && (missing17 = "axis"))){
const err106 = {instancePath,schemaPath:"#/oneOf/13/required",keyword:"required",params:{missingProperty: missing17},message:"must have required property '"+missing17+"'"};
if(vErrors === null){
vErrors = [err106];
}
else {
vErrors.push(err106);
}
errors++;
}
else {
const _errs134 = errors;
for(const key17 in data){
if(!((((key17 === "after") || (key17 === "axis")) || (key17 === "fleet")) || (key17 === "operation"))){
const err107 = {instancePath,schemaPath:"#/oneOf/13/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key17},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err107];
}
else {
vErrors.push(err107);
}
errors++;
break;
}
}
if(_errs134 === errors){
if(data.after !== undefined){
const _errs135 = errors;
if(typeof data.after !== "string"){
const err108 = {instancePath:instancePath+"/after",schemaPath:"#/oneOf/13/properties/after/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err108];
}
else {
vErrors.push(err108);
}
errors++;
}
var valid21 = _errs135 === errors;
}
else {
var valid21 = true;
}
if(valid21){
if(data.axis !== undefined){
let data40 = data.axis;
const _errs137 = errors;
if(typeof data40 !== "string"){
const err109 = {instancePath:instancePath+"/axis",schemaPath:"#/definitions/Axis/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err109];
}
else {
vErrors.push(err109);
}
errors++;
}
if(!((data40 === "horizontal") || (data40 === "vertical"))){
const err110 = {instancePath:instancePath+"/axis",schemaPath:"#/definitions/Axis/enum",keyword:"enum",params:{allowedValues: schema112.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err110];
}
else {
vErrors.push(err110);
}
errors++;
}
var valid21 = _errs137 === errors;
}
else {
var valid21 = true;
}
if(valid21){
if(data.fleet !== undefined){
const _errs140 = errors;
if(typeof data.fleet !== "string"){
const err111 = {instancePath:instancePath+"/fleet",schemaPath:"#/oneOf/13/properties/fleet/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err111];
}
else {
vErrors.push(err111);
}
errors++;
}
var valid21 = _errs140 === errors;
}
else {
var valid21 = true;
}
if(valid21){
if(data.operation !== undefined){
let data42 = data.operation;
const _errs142 = errors;
if(typeof data42 !== "string"){
const err112 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/13/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err112];
}
else {
vErrors.push(err112);
}
errors++;
}
if("split" !== data42){
const err113 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/13/properties/operation/const",keyword:"const",params:{allowedValue: "split"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err113];
}
else {
vErrors.push(err113);
}
errors++;
}
var valid21 = _errs142 === errors;
}
else {
var valid21 = true;
}
}
}
}
}
}
}
else {
const err114 = {instancePath,schemaPath:"#/oneOf/13/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err114];
}
else {
vErrors.push(err114);
}
errors++;
}
}
var _valid0 = _errs132 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 13];
}
else {
if(_valid0){
valid0 = true;
passing0 = 13;
}
const _errs144 = errors;
if(errors === _errs144){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing18;
if(((((data.operation === undefined) && (missing18 = "operation")) || ((data.fleet === undefined) && (missing18 = "fleet"))) || ((data.path === undefined) && (missing18 = "path"))) || ((data.share === undefined) && (missing18 = "share"))){
const err115 = {instancePath,schemaPath:"#/oneOf/14/required",keyword:"required",params:{missingProperty: missing18},message:"must have required property '"+missing18+"'"};
if(vErrors === null){
vErrors = [err115];
}
else {
vErrors.push(err115);
}
errors++;
}
else {
const _errs146 = errors;
for(const key18 in data){
if(!((((key18 === "fleet") || (key18 === "operation")) || (key18 === "path")) || (key18 === "share"))){
const err116 = {instancePath,schemaPath:"#/oneOf/14/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key18},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err116];
}
else {
vErrors.push(err116);
}
errors++;
break;
}
}
if(_errs146 === errors){
if(data.fleet !== undefined){
const _errs147 = errors;
if(typeof data.fleet !== "string"){
const err117 = {instancePath:instancePath+"/fleet",schemaPath:"#/oneOf/14/properties/fleet/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err117];
}
else {
vErrors.push(err117);
}
errors++;
}
var valid23 = _errs147 === errors;
}
else {
var valid23 = true;
}
if(valid23){
if(data.operation !== undefined){
let data44 = data.operation;
const _errs149 = errors;
if(typeof data44 !== "string"){
const err118 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/14/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err118];
}
else {
vErrors.push(err118);
}
errors++;
}
if("resize-split" !== data44){
const err119 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/14/properties/operation/const",keyword:"const",params:{allowedValue: "resize-split"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err119];
}
else {
vErrors.push(err119);
}
errors++;
}
var valid23 = _errs149 === errors;
}
else {
var valid23 = true;
}
if(valid23){
if(data.path !== undefined){
let data45 = data.path;
const _errs151 = errors;
if(errors === _errs151){
if(Array.isArray(data45)){
if(data45.length > 128){
const err120 = {instancePath:instancePath+"/path",schemaPath:"#/oneOf/14/properties/path/maxItems",keyword:"maxItems",params:{limit: 128},message:"must NOT have more than 128 items"};
if(vErrors === null){
vErrors = [err120];
}
else {
vErrors.push(err120);
}
errors++;
}
else {
var valid24 = true;
const len0 = data45.length;
for(let i0=0; i0<len0; i0++){
let data46 = data45[i0];
const _errs153 = errors;
if(typeof data46 !== "string"){
const err121 = {instancePath:instancePath+"/path/" + i0,schemaPath:"#/definitions/SplitChild/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err121];
}
else {
vErrors.push(err121);
}
errors++;
}
if(!((data46 === "first") || (data46 === "second"))){
const err122 = {instancePath:instancePath+"/path/" + i0,schemaPath:"#/definitions/SplitChild/enum",keyword:"enum",params:{allowedValues: schema118.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err122];
}
else {
vErrors.push(err122);
}
errors++;
}
var valid24 = _errs153 === errors;
if(!valid24){
break;
}
}
}
}
else {
const err123 = {instancePath:instancePath+"/path",schemaPath:"#/oneOf/14/properties/path/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err123];
}
else {
vErrors.push(err123);
}
errors++;
}
}
var valid23 = _errs151 === errors;
}
else {
var valid23 = true;
}
if(valid23){
if(data.share !== undefined){
let data47 = data.share;
const _errs156 = errors;
const _errs157 = errors;
if(!(((typeof data47 == "number") && (!(data47 % 1) && !isNaN(data47))) && (isFinite(data47)))){
const err124 = {instancePath:instancePath+"/share",schemaPath:"#/definitions/SplitShare/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err124];
}
else {
vErrors.push(err124);
}
errors++;
}
if(errors === _errs157){
if((typeof data47 == "number") && (isFinite(data47))){
if(data47 > 9999 || isNaN(data47)){
const err125 = {instancePath:instancePath+"/share",schemaPath:"#/definitions/SplitShare/maximum",keyword:"maximum",params:{comparison: "<=", limit: 9999},message:"must be <= 9999"};
if(vErrors === null){
vErrors = [err125];
}
else {
vErrors.push(err125);
}
errors++;
}
else {
if(data47 < 1 || isNaN(data47)){
const err126 = {instancePath:instancePath+"/share",schemaPath:"#/definitions/SplitShare/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err126];
}
else {
vErrors.push(err126);
}
errors++;
}
}
}
}
var valid23 = _errs156 === errors;
}
else {
var valid23 = true;
}
}
}
}
}
}
}
else {
const err127 = {instancePath,schemaPath:"#/oneOf/14/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err127];
}
else {
vErrors.push(err127);
}
errors++;
}
}
var _valid0 = _errs144 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 14];
}
else {
if(_valid0){
valid0 = true;
passing0 = 14;
}
const _errs159 = errors;
if(errors === _errs159){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing19;
if(((((data.operation === undefined) && (missing19 = "operation")) || ((data.id === undefined) && (missing19 = "id"))) || ((data.target === undefined) && (missing19 = "target"))) || ((data.side === undefined) && (missing19 = "side"))){
const err128 = {instancePath,schemaPath:"#/oneOf/15/required",keyword:"required",params:{missingProperty: missing19},message:"must have required property '"+missing19+"'"};
if(vErrors === null){
vErrors = [err128];
}
else {
vErrors.push(err128);
}
errors++;
}
else {
const _errs161 = errors;
for(const key19 in data){
if(!((((key19 === "id") || (key19 === "operation")) || (key19 === "side")) || (key19 === "target"))){
const err129 = {instancePath,schemaPath:"#/oneOf/15/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key19},message:"must NOT have additional properties"};
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
if(_errs161 === errors){
if(data.id !== undefined){
const _errs162 = errors;
if(typeof data.id !== "string"){
const err130 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/15/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err130];
}
else {
vErrors.push(err130);
}
errors++;
}
var valid27 = _errs162 === errors;
}
else {
var valid27 = true;
}
if(valid27){
if(data.operation !== undefined){
let data49 = data.operation;
const _errs164 = errors;
if(typeof data49 !== "string"){
const err131 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/15/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err131];
}
else {
vErrors.push(err131);
}
errors++;
}
if("move-vessel" !== data49){
const err132 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/15/properties/operation/const",keyword:"const",params:{allowedValue: "move-vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err132];
}
else {
vErrors.push(err132);
}
errors++;
}
var valid27 = _errs164 === errors;
}
else {
var valid27 = true;
}
if(valid27){
if(data.side !== undefined){
let data50 = data.side;
const _errs166 = errors;
if(typeof data50 !== "string"){
const err133 = {instancePath:instancePath+"/side",schemaPath:"#/definitions/Side/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err133];
}
else {
vErrors.push(err133);
}
errors++;
}
if(!((((data50 === "left") || (data50 === "right")) || (data50 === "top")) || (data50 === "bottom"))){
const err134 = {instancePath:instancePath+"/side",schemaPath:"#/definitions/Side/enum",keyword:"enum",params:{allowedValues: schema120.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err134];
}
else {
vErrors.push(err134);
}
errors++;
}
var valid27 = _errs166 === errors;
}
else {
var valid27 = true;
}
if(valid27){
if(data.target !== undefined){
const _errs169 = errors;
if(typeof data.target !== "string"){
const err135 = {instancePath:instancePath+"/target",schemaPath:"#/oneOf/15/properties/target/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err135];
}
else {
vErrors.push(err135);
}
errors++;
}
var valid27 = _errs169 === errors;
}
else {
var valid27 = true;
}
}
}
}
}
}
}
else {
const err136 = {instancePath,schemaPath:"#/oneOf/15/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err136];
}
else {
vErrors.push(err136);
}
errors++;
}
}
var _valid0 = _errs159 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 15];
}
else {
if(_valid0){
valid0 = true;
passing0 = 15;
}
const _errs171 = errors;
if(errors === _errs171){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing20;
if(((((data.operation === undefined) && (missing20 = "operation")) || ((data.id === undefined) && (missing20 = "id"))) || ((data.target === undefined) && (missing20 = "target"))) || ((data.before === undefined) && (missing20 = "before"))){
const err137 = {instancePath,schemaPath:"#/oneOf/16/required",keyword:"required",params:{missingProperty: missing20},message:"must have required property '"+missing20+"'"};
if(vErrors === null){
vErrors = [err137];
}
else {
vErrors.push(err137);
}
errors++;
}
else {
const _errs173 = errors;
for(const key20 in data){
if(!((((key20 === "before") || (key20 === "id")) || (key20 === "operation")) || (key20 === "target"))){
const err138 = {instancePath,schemaPath:"#/oneOf/16/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key20},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err138];
}
else {
vErrors.push(err138);
}
errors++;
break;
}
}
if(_errs173 === errors){
if(data.before !== undefined){
const _errs174 = errors;
if(typeof data.before !== "boolean"){
const err139 = {instancePath:instancePath+"/before",schemaPath:"#/oneOf/16/properties/before/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err139];
}
else {
vErrors.push(err139);
}
errors++;
}
var valid29 = _errs174 === errors;
}
else {
var valid29 = true;
}
if(valid29){
if(data.id !== undefined){
const _errs176 = errors;
if(typeof data.id !== "string"){
const err140 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/16/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err140];
}
else {
vErrors.push(err140);
}
errors++;
}
var valid29 = _errs176 === errors;
}
else {
var valid29 = true;
}
if(valid29){
if(data.operation !== undefined){
let data54 = data.operation;
const _errs178 = errors;
if(typeof data54 !== "string"){
const err141 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/16/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err141];
}
else {
vErrors.push(err141);
}
errors++;
}
if("move-voyage" !== data54){
const err142 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/16/properties/operation/const",keyword:"const",params:{allowedValue: "move-voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err142];
}
else {
vErrors.push(err142);
}
errors++;
}
var valid29 = _errs178 === errors;
}
else {
var valid29 = true;
}
if(valid29){
if(data.target !== undefined){
const _errs180 = errors;
if(typeof data.target !== "string"){
const err143 = {instancePath:instancePath+"/target",schemaPath:"#/oneOf/16/properties/target/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err143];
}
else {
vErrors.push(err143);
}
errors++;
}
var valid29 = _errs180 === errors;
}
else {
var valid29 = true;
}
}
}
}
}
}
}
else {
const err144 = {instancePath,schemaPath:"#/oneOf/16/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err144];
}
else {
vErrors.push(err144);
}
errors++;
}
}
var _valid0 = _errs171 === errors;
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
if(((((data.operation === undefined) && (missing21 = "operation")) || ((data.id === undefined) && (missing21 = "id"))) || ((data.target === undefined) && (missing21 = "target"))) || ((data.before === undefined) && (missing21 = "before"))){
const err145 = {instancePath,schemaPath:"#/oneOf/17/required",keyword:"required",params:{missingProperty: missing21},message:"must have required property '"+missing21+"'"};
if(vErrors === null){
vErrors = [err145];
}
else {
vErrors.push(err145);
}
errors++;
}
else {
const _errs184 = errors;
for(const key21 in data){
if(!((((key21 === "before") || (key21 === "id")) || (key21 === "operation")) || (key21 === "target"))){
const err146 = {instancePath,schemaPath:"#/oneOf/17/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key21},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err146];
}
else {
vErrors.push(err146);
}
errors++;
break;
}
}
if(_errs184 === errors){
if(data.before !== undefined){
const _errs185 = errors;
if(typeof data.before !== "boolean"){
const err147 = {instancePath:instancePath+"/before",schemaPath:"#/oneOf/17/properties/before/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err147];
}
else {
vErrors.push(err147);
}
errors++;
}
var valid30 = _errs185 === errors;
}
else {
var valid30 = true;
}
if(valid30){
if(data.id !== undefined){
const _errs187 = errors;
if(typeof data.id !== "string"){
const err148 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/17/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err148];
}
else {
vErrors.push(err148);
}
errors++;
}
var valid30 = _errs187 === errors;
}
else {
var valid30 = true;
}
if(valid30){
if(data.operation !== undefined){
let data58 = data.operation;
const _errs189 = errors;
if(typeof data58 !== "string"){
const err149 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/17/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err149];
}
else {
vErrors.push(err149);
}
errors++;
}
if("move-fleet" !== data58){
const err150 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/17/properties/operation/const",keyword:"const",params:{allowedValue: "move-fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err150];
}
else {
vErrors.push(err150);
}
errors++;
}
var valid30 = _errs189 === errors;
}
else {
var valid30 = true;
}
if(valid30){
if(data.target !== undefined){
const _errs191 = errors;
if(typeof data.target !== "string"){
const err151 = {instancePath:instancePath+"/target",schemaPath:"#/oneOf/17/properties/target/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err151];
}
else {
vErrors.push(err151);
}
errors++;
}
var valid30 = _errs191 === errors;
}
else {
var valid30 = true;
}
}
}
}
}
}
}
else {
const err152 = {instancePath,schemaPath:"#/oneOf/17/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err152];
}
else {
vErrors.push(err152);
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
const _errs193 = errors;
if(errors === _errs193){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing22;
if(((data.operation === undefined) && (missing22 = "operation")) || ((data.id === undefined) && (missing22 = "id"))){
const err153 = {instancePath,schemaPath:"#/oneOf/18/required",keyword:"required",params:{missingProperty: missing22},message:"must have required property '"+missing22+"'"};
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
for(const key22 in data){
if(!((key22 === "id") || (key22 === "operation"))){
const err154 = {instancePath,schemaPath:"#/oneOf/18/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key22},message:"must NOT have additional properties"};
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
if(data.id !== undefined){
const _errs196 = errors;
if(typeof data.id !== "string"){
const err155 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/18/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err155];
}
else {
vErrors.push(err155);
}
errors++;
}
var valid31 = _errs196 === errors;
}
else {
var valid31 = true;
}
if(valid31){
if(data.operation !== undefined){
let data61 = data.operation;
const _errs198 = errors;
if(typeof data61 !== "string"){
const err156 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/18/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err156];
}
else {
vErrors.push(err156);
}
errors++;
}
if("select-voyage" !== data61){
const err157 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/18/properties/operation/const",keyword:"const",params:{allowedValue: "select-voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err157];
}
else {
vErrors.push(err157);
}
errors++;
}
var valid31 = _errs198 === errors;
}
else {
var valid31 = true;
}
}
}
}
}
else {
const err158 = {instancePath,schemaPath:"#/oneOf/18/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err158];
}
else {
vErrors.push(err158);
}
errors++;
}
}
var _valid0 = _errs193 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 18];
}
else {
if(_valid0){
valid0 = true;
passing0 = 18;
}
const _errs200 = errors;
if(errors === _errs200){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing23;
if(((data.operation === undefined) && (missing23 = "operation")) || ((data.id === undefined) && (missing23 = "id"))){
const err159 = {instancePath,schemaPath:"#/oneOf/19/required",keyword:"required",params:{missingProperty: missing23},message:"must have required property '"+missing23+"'"};
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
for(const key23 in data){
if(!((key23 === "id") || (key23 === "operation"))){
const err160 = {instancePath,schemaPath:"#/oneOf/19/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key23},message:"must NOT have additional properties"};
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
if(data.id !== undefined){
const _errs203 = errors;
if(typeof data.id !== "string"){
const err161 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/19/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err161];
}
else {
vErrors.push(err161);
}
errors++;
}
var valid32 = _errs203 === errors;
}
else {
var valid32 = true;
}
if(valid32){
if(data.operation !== undefined){
let data63 = data.operation;
const _errs205 = errors;
if(typeof data63 !== "string"){
const err162 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/19/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err162];
}
else {
vErrors.push(err162);
}
errors++;
}
if("select-fleet" !== data63){
const err163 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/19/properties/operation/const",keyword:"const",params:{allowedValue: "select-fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err163];
}
else {
vErrors.push(err163);
}
errors++;
}
var valid32 = _errs205 === errors;
}
else {
var valid32 = true;
}
}
}
}
}
else {
const err164 = {instancePath,schemaPath:"#/oneOf/19/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err164];
}
else {
vErrors.push(err164);
}
errors++;
}
}
var _valid0 = _errs200 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 19];
}
else {
if(_valid0){
valid0 = true;
passing0 = 19;
}
const _errs207 = errors;
if(errors === _errs207){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing24;
if(((data.operation === undefined) && (missing24 = "operation")) || ((data.id === undefined) && (missing24 = "id"))){
const err165 = {instancePath,schemaPath:"#/oneOf/20/required",keyword:"required",params:{missingProperty: missing24},message:"must have required property '"+missing24+"'"};
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
for(const key24 in data){
if(!((key24 === "id") || (key24 === "operation"))){
const err166 = {instancePath,schemaPath:"#/oneOf/20/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key24},message:"must NOT have additional properties"};
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
if(data.id !== undefined){
const _errs210 = errors;
if(typeof data.id !== "string"){
const err167 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/20/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err167];
}
else {
vErrors.push(err167);
}
errors++;
}
var valid33 = _errs210 === errors;
}
else {
var valid33 = true;
}
if(valid33){
if(data.operation !== undefined){
let data65 = data.operation;
const _errs212 = errors;
if(typeof data65 !== "string"){
const err168 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/20/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err168];
}
else {
vErrors.push(err168);
}
errors++;
}
if("reveal-vessel" !== data65){
const err169 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/20/properties/operation/const",keyword:"const",params:{allowedValue: "reveal-vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err169];
}
else {
vErrors.push(err169);
}
errors++;
}
var valid33 = _errs212 === errors;
}
else {
var valid33 = true;
}
}
}
}
}
else {
const err170 = {instancePath,schemaPath:"#/oneOf/20/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err170];
}
else {
vErrors.push(err170);
}
errors++;
}
}
var _valid0 = _errs207 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 20];
}
else {
if(_valid0){
valid0 = true;
passing0 = 20;
}
const _errs214 = errors;
if(errors === _errs214){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing25;
if(((data.operation === undefined) && (missing25 = "operation")) || ((data.context === undefined) && (missing25 = "context"))){
const err171 = {instancePath,schemaPath:"#/oneOf/21/required",keyword:"required",params:{missingProperty: missing25},message:"must have required property '"+missing25+"'"};
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
for(const key25 in data){
if(!((key25 === "context") || (key25 === "operation"))){
const err172 = {instancePath,schemaPath:"#/oneOf/21/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key25},message:"must NOT have additional properties"};
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
if(data.context !== undefined){
let data66 = data.context;
const _errs217 = errors;
const _errs219 = errors;
let valid36 = false;
let passing2 = null;
const _errs220 = errors;
if(errors === _errs220){
if(data66 && typeof data66 == "object" && !Array.isArray(data66)){
let missing26;
if((data66.kind === undefined) && (missing26 = "kind")){
const err173 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/0/required",keyword:"required",params:{missingProperty: missing26},message:"must have required property '"+missing26+"'"};
if(vErrors === null){
vErrors = [err173];
}
else {
vErrors.push(err173);
}
errors++;
}
else {
const _errs222 = errors;
for(const key26 in data66){
if(!(key26 === "kind")){
const err174 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key26},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err174];
}
else {
vErrors.push(err174);
}
errors++;
break;
}
}
if(_errs222 === errors){
if(data66.kind !== undefined){
let data67 = data66.kind;
if(typeof data67 !== "string"){
const err175 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err175];
}
else {
vErrors.push(err175);
}
errors++;
}
if("workspace" !== data67){
const err176 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "workspace"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err176];
}
else {
vErrors.push(err176);
}
errors++;
}
}
}
}
}
else {
const err177 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err177];
}
else {
vErrors.push(err177);
}
errors++;
}
}
var _valid3 = _errs220 === errors;
if(_valid3){
valid36 = true;
passing2 = 0;
}
const _errs225 = errors;
if(errors === _errs225){
if(data66 && typeof data66 == "object" && !Array.isArray(data66)){
let missing27;
if(((data66.kind === undefined) && (missing27 = "kind")) || ((data66.id === undefined) && (missing27 = "id"))){
const err178 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/1/required",keyword:"required",params:{missingProperty: missing27},message:"must have required property '"+missing27+"'"};
if(vErrors === null){
vErrors = [err178];
}
else {
vErrors.push(err178);
}
errors++;
}
else {
const _errs227 = errors;
for(const key27 in data66){
if(!((key27 === "id") || (key27 === "kind"))){
const err179 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key27},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err179];
}
else {
vErrors.push(err179);
}
errors++;
break;
}
}
if(_errs227 === errors){
if(data66.id !== undefined){
const _errs228 = errors;
if(typeof data66.id !== "string"){
const err180 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/1/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err180];
}
else {
vErrors.push(err180);
}
errors++;
}
var valid38 = _errs228 === errors;
}
else {
var valid38 = true;
}
if(valid38){
if(data66.kind !== undefined){
let data69 = data66.kind;
const _errs230 = errors;
if(typeof data69 !== "string"){
const err181 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err181];
}
else {
vErrors.push(err181);
}
errors++;
}
if("voyage" !== data69){
const err182 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err182];
}
else {
vErrors.push(err182);
}
errors++;
}
var valid38 = _errs230 === errors;
}
else {
var valid38 = true;
}
}
}
}
}
else {
const err183 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err183];
}
else {
vErrors.push(err183);
}
errors++;
}
}
var _valid3 = _errs225 === errors;
if(_valid3 && valid36){
valid36 = false;
passing2 = [passing2, 1];
}
else {
if(_valid3){
valid36 = true;
passing2 = 1;
}
const _errs232 = errors;
if(errors === _errs232){
if(data66 && typeof data66 == "object" && !Array.isArray(data66)){
let missing28;
if(((data66.kind === undefined) && (missing28 = "kind")) || ((data66.id === undefined) && (missing28 = "id"))){
const err184 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/2/required",keyword:"required",params:{missingProperty: missing28},message:"must have required property '"+missing28+"'"};
if(vErrors === null){
vErrors = [err184];
}
else {
vErrors.push(err184);
}
errors++;
}
else {
const _errs234 = errors;
for(const key28 in data66){
if(!((key28 === "id") || (key28 === "kind"))){
const err185 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key28},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err185];
}
else {
vErrors.push(err185);
}
errors++;
break;
}
}
if(_errs234 === errors){
if(data66.id !== undefined){
const _errs235 = errors;
if(typeof data66.id !== "string"){
const err186 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/2/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err186];
}
else {
vErrors.push(err186);
}
errors++;
}
var valid39 = _errs235 === errors;
}
else {
var valid39 = true;
}
if(valid39){
if(data66.kind !== undefined){
let data71 = data66.kind;
const _errs237 = errors;
if(typeof data71 !== "string"){
const err187 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err187];
}
else {
vErrors.push(err187);
}
errors++;
}
if("fleet" !== data71){
const err188 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err188];
}
else {
vErrors.push(err188);
}
errors++;
}
var valid39 = _errs237 === errors;
}
else {
var valid39 = true;
}
}
}
}
}
else {
const err189 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err189];
}
else {
vErrors.push(err189);
}
errors++;
}
}
var _valid3 = _errs232 === errors;
if(_valid3 && valid36){
valid36 = false;
passing2 = [passing2, 2];
}
else {
if(_valid3){
valid36 = true;
passing2 = 2;
}
const _errs239 = errors;
if(errors === _errs239){
if(data66 && typeof data66 == "object" && !Array.isArray(data66)){
let missing29;
if(((data66.kind === undefined) && (missing29 = "kind")) || ((data66.id === undefined) && (missing29 = "id"))){
const err190 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/3/required",keyword:"required",params:{missingProperty: missing29},message:"must have required property '"+missing29+"'"};
if(vErrors === null){
vErrors = [err190];
}
else {
vErrors.push(err190);
}
errors++;
}
else {
const _errs241 = errors;
for(const key29 in data66){
if(!((key29 === "id") || (key29 === "kind"))){
const err191 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key29},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err191];
}
else {
vErrors.push(err191);
}
errors++;
break;
}
}
if(_errs241 === errors){
if(data66.id !== undefined){
const _errs242 = errors;
if(typeof data66.id !== "string"){
const err192 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/3/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err192];
}
else {
vErrors.push(err192);
}
errors++;
}
var valid40 = _errs242 === errors;
}
else {
var valid40 = true;
}
if(valid40){
if(data66.kind !== undefined){
let data73 = data66.kind;
const _errs244 = errors;
if(typeof data73 !== "string"){
const err193 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/3/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err193];
}
else {
vErrors.push(err193);
}
errors++;
}
if("vessel" !== data73){
const err194 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/3/properties/kind/const",keyword:"const",params:{allowedValue: "vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err194];
}
else {
vErrors.push(err194);
}
errors++;
}
var valid40 = _errs244 === errors;
}
else {
var valid40 = true;
}
}
}
}
}
else {
const err195 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err195];
}
else {
vErrors.push(err195);
}
errors++;
}
}
var _valid3 = _errs239 === errors;
if(_valid3 && valid36){
valid36 = false;
passing2 = [passing2, 3];
}
else {
if(_valid3){
valid36 = true;
passing2 = 3;
}
const _errs246 = errors;
if(errors === _errs246){
if(data66 && typeof data66 == "object" && !Array.isArray(data66)){
let missing30;
if(((data66.kind === undefined) && (missing30 = "kind")) || ((data66.id === undefined) && (missing30 = "id"))){
const err196 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/4/required",keyword:"required",params:{missingProperty: missing30},message:"must have required property '"+missing30+"'"};
if(vErrors === null){
vErrors = [err196];
}
else {
vErrors.push(err196);
}
errors++;
}
else {
const _errs248 = errors;
for(const key30 in data66){
if(!((key30 === "id") || (key30 === "kind"))){
const err197 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key30},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err197];
}
else {
vErrors.push(err197);
}
errors++;
break;
}
}
if(_errs248 === errors){
if(data66.id !== undefined){
const _errs249 = errors;
if(typeof data66.id !== "string"){
const err198 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/4/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err198];
}
else {
vErrors.push(err198);
}
errors++;
}
var valid41 = _errs249 === errors;
}
else {
var valid41 = true;
}
if(valid41){
if(data66.kind !== undefined){
let data75 = data66.kind;
const _errs251 = errors;
if(typeof data75 !== "string"){
const err199 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/4/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err199];
}
else {
vErrors.push(err199);
}
errors++;
}
if("portal" !== data75){
const err200 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/4/properties/kind/const",keyword:"const",params:{allowedValue: "portal"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err200];
}
else {
vErrors.push(err200);
}
errors++;
}
var valid41 = _errs251 === errors;
}
else {
var valid41 = true;
}
}
}
}
}
else {
const err201 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err201];
}
else {
vErrors.push(err201);
}
errors++;
}
}
var _valid3 = _errs246 === errors;
if(_valid3 && valid36){
valid36 = false;
passing2 = [passing2, 4];
}
else {
if(_valid3){
valid36 = true;
passing2 = 4;
}
}
}
}
}
if(!valid36){
const err202 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf",keyword:"oneOf",params:{passingSchemas: passing2},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err202];
}
else {
vErrors.push(err202);
}
errors++;
}
else {
errors = _errs219;
if(vErrors !== null){
if(_errs219){
vErrors.length = _errs219;
}
else {
vErrors = null;
}
}
}
var valid34 = _errs217 === errors;
}
else {
var valid34 = true;
}
if(valid34){
if(data.operation !== undefined){
let data76 = data.operation;
const _errs253 = errors;
if(typeof data76 !== "string"){
const err203 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/21/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err203];
}
else {
vErrors.push(err203);
}
errors++;
}
if("dock" !== data76){
const err204 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/21/properties/operation/const",keyword:"const",params:{allowedValue: "dock"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err204];
}
else {
vErrors.push(err204);
}
errors++;
}
var valid34 = _errs253 === errors;
}
else {
var valid34 = true;
}
}
}
}
}
else {
const err205 = {instancePath,schemaPath:"#/oneOf/21/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err205];
}
else {
vErrors.push(err205);
}
errors++;
}
}
var _valid0 = _errs214 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 21];
}
else {
if(_valid0){
valid0 = true;
passing0 = 21;
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
}
}
}
}
if(!valid0){
const err206 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err206];
}
else {
vErrors.push(err206);
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
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((((data.requestId === undefined) && (missing0 = "requestId")) || ((data.expectedVersion === undefined) && (missing0 = "expectedVersion"))) || ((data.action === undefined) && (missing0 = "action"))){
validate58.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(((key0 === "action") || (key0 === "expectedVersion")) || (key0 === "requestId"))){
validate58.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.action !== undefined){
const _errs2 = errors;
if(!(validate59(data.action, {instancePath:instancePath+"/action",parentData:data,parentDataProperty:"action",rootData}))){
vErrors = vErrors === null ? validate59.errors : vErrors.concat(validate59.errors);
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
validate58.errors = [{instancePath:instancePath+"/expectedVersion",schemaPath:"#/properties/expectedVersion/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate58.errors = [{instancePath:instancePath+"/requestId",schemaPath:"#/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate58.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate58.errors = vErrors;
return errors === 0;
}

export const response = validate69;
const schema122 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"definitions":{"Axis":{"enum":["horizontal","vertical"],"type":"string"},"Canvas":{"additionalProperties":false,"properties":{"portalMode":{"allOf":[{"$ref":"#/definitions/PortalMode"}],"default":"overlay"},"root":{"$ref":"#/definitions/Node"},"sidebarCollapsed":{"default":false,"type":"boolean"}},"required":["root"],"type":"object"},"Content":{"additionalProperties":false,"properties":{"backend":{"type":["string","null"]},"cwd":{"type":"string"},"id":{"type":"string"},"launch":{"anyOf":[{"$ref":"#/definitions/Launch"},{"type":"null"}]},"startPending":{"type":["string","null"]},"typeId":{"type":"string"}},"required":["id","typeId","cwd"],"type":"object"},"Context":{"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"workspace","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]},"Effort":{"enum":["low","medium","high","xhigh","max","ultra"],"type":"string"},"Fleet":{"additionalProperties":false,"properties":{"id":{"type":"string"},"name":{"type":"string"},"root":{"$ref":"#/definitions/Split"},"vessels":{"items":{"$ref":"#/definitions/Vessel"},"type":"array"}},"required":["id","name","vessels","root"],"type":"object"},"Launch":{"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"terminal","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"effort":{"allOf":[{"$ref":"#/definitions/Effort"}],"default":"high"},"kind":{"const":"codex","type":"string"},"model":{"default":"gpt-6.1-sol","type":"string"},"permissions":{"allOf":[{"$ref":"#/definitions/Permissions"}],"default":"yolo"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"argv":{"items":{"type":"string"},"type":"array"},"kind":{"const":"program","type":"string"}},"required":["kind","argv"],"type":"object"}]},"Layout":{"additionalProperties":false,"properties":{"canvas":{"allOf":[{"$ref":"#/definitions/Canvas"}],"default":{"portalMode":"overlay","root":{"children":[{"kind":"block","region":"sidebar","size":{"kind":"fixed","pixels":224}},{"children":[{"kind":"block","region":"fleet-strip","size":{"kind":"fixed","pixels":40}},{"children":[{"kind":"block","region":"active-fleet","size":{"kind":"fill"}},{"kind":"block","region":"portals","size":{"kind":"fixed","pixels":340}}],"kind":"row","size":{"kind":"fill"}},{"kind":"block","region":"context-bar","size":{"kind":"content"}}],"kind":"column","size":{"kind":"fill"}}],"kind":"row","size":{"kind":"fill"}},"sidebarCollapsed":false}},"contents":{"items":{"$ref":"#/definitions/Content"},"type":"array"},"context":{"$ref":"#/definitions/Context"},"nextId":{"type":"string"},"savedLayouts":{"default":[],"items":{"$ref":"#/definitions/SavedLayout"},"type":"array"},"selectedFleet":{"type":["string","null"]},"selectedVoyage":{"type":["string","null"]},"view":{"allOf":[{"$ref":"#/definitions/WorkspaceView"}],"default":"fleet"},"voyages":{"items":{"$ref":"#/definitions/Voyage"},"type":"array"}},"required":["voyages","contents","context","nextId"],"type":"object"},"Node":{"oneOf":[{"additionalProperties":false,"properties":{"children":{"items":{"$ref":"#/definitions/Node"},"type":"array"},"kind":{"const":"row","type":"string"},"size":{"allOf":[{"$ref":"#/definitions/Size"}],"default":{"kind":"fill"}}},"required":["kind","children"],"type":"object"},{"additionalProperties":false,"properties":{"children":{"items":{"$ref":"#/definitions/Node"},"type":"array"},"kind":{"const":"column","type":"string"},"size":{"allOf":[{"$ref":"#/definitions/Size"}],"default":{"kind":"fill"}}},"required":["kind","children"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"block","type":"string"},"region":{"$ref":"#/definitions/Region"},"size":{"allOf":[{"$ref":"#/definitions/Size"}],"default":{"kind":"fill"}}},"required":["kind","region"],"type":"object"}]},"Permissions":{"enum":["yolo","workspace-write","read-only"],"type":"string"},"PortalMode":{"enum":["overlay","make-room"],"type":"string"},"Region":{"enum":["sidebar","fleet-strip","active-fleet","portals","context-bar"],"type":"string"},"SavedLayout":{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"name":{"type":"string"},"root":{"$ref":"#/definitions/Split"}},"required":["fleet","name","root"],"type":"object"},"Size":{"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"fill","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"content","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"fixed","type":"string"},"pixels":{"maximum":4096,"minimum":1,"type":"integer"}},"required":["kind","pixels"],"type":"object"}]},"Split":{"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"leaf","type":"string"},"placement":{"type":"string"}},"required":["kind","placement"],"type":"object"},{"additionalProperties":false,"properties":{"axis":{"$ref":"#/definitions/Axis"},"first":{"$ref":"#/definitions/Split"},"kind":{"const":"branch","type":"string"},"second":{"$ref":"#/definitions/Split"},"share":{"allOf":[{"$ref":"#/definitions/SplitShare"}],"default":5000}},"required":["kind","axis","first","second"],"type":"object"}]},"SplitShare":{"maximum":9999,"minimum":1,"type":"integer"},"Status":{"enum":["applied","rejected","uncertain"],"type":"string"},"Vessel":{"additionalProperties":false,"properties":{"content":{"type":"string"},"id":{"type":"string"},"name":{"type":["string","null"]}},"required":["id","content"],"type":"object"},"Voyage":{"additionalProperties":false,"properties":{"fleets":{"items":{"$ref":"#/definitions/Fleet"},"type":"array"},"id":{"type":"string"},"name":{"type":"string"},"portals":{"items":{"$ref":"#/definitions/Vessel"},"type":"array"}},"required":["id","name","fleets","portals"],"type":"object"},"WorkspaceView":{"enum":["home","fleet"],"type":"string"}},"properties":{"createdContents":{"items":{"type":"string"},"type":"array"},"createdWorkspace":{"type":"boolean"},"fresh":{"type":"boolean"},"layout":{"$ref":"#/definitions/Layout"},"message":{"type":["string","null"]},"requestId":{"type":"string"},"status":{"$ref":"#/definitions/Status"},"version":{"type":"string"}},"required":["requestId","status","version","layout","fresh","createdWorkspace","createdContents"],"title":"Response","type":"object"};
const schema145 = {"enum":["applied","rejected","uncertain"],"type":"string"};
const schema123 = {"additionalProperties":false,"properties":{"canvas":{"allOf":[{"$ref":"#/definitions/Canvas"}],"default":{"portalMode":"overlay","root":{"children":[{"kind":"block","region":"sidebar","size":{"kind":"fixed","pixels":224}},{"children":[{"kind":"block","region":"fleet-strip","size":{"kind":"fixed","pixels":40}},{"children":[{"kind":"block","region":"active-fleet","size":{"kind":"fill"}},{"kind":"block","region":"portals","size":{"kind":"fixed","pixels":340}}],"kind":"row","size":{"kind":"fill"}},{"kind":"block","region":"context-bar","size":{"kind":"content"}}],"kind":"column","size":{"kind":"fill"}}],"kind":"row","size":{"kind":"fill"}},"sidebarCollapsed":false}},"contents":{"items":{"$ref":"#/definitions/Content"},"type":"array"},"context":{"$ref":"#/definitions/Context"},"nextId":{"type":"string"},"savedLayouts":{"default":[],"items":{"$ref":"#/definitions/SavedLayout"},"type":"array"},"selectedFleet":{"type":["string","null"]},"selectedVoyage":{"type":["string","null"]},"view":{"allOf":[{"$ref":"#/definitions/WorkspaceView"}],"default":"fleet"},"voyages":{"items":{"$ref":"#/definitions/Voyage"},"type":"array"}},"required":["voyages","contents","context","nextId"],"type":"object"};
const schema135 = {"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"workspace","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]};
const schema140 = {"enum":["home","fleet"],"type":"string"};
const schema124 = {"additionalProperties":false,"properties":{"portalMode":{"allOf":[{"$ref":"#/definitions/PortalMode"}],"default":"overlay"},"root":{"$ref":"#/definitions/Node"},"sidebarCollapsed":{"default":false,"type":"boolean"}},"required":["root"],"type":"object"};
const schema125 = {"enum":["overlay","make-room"],"type":"string"};
const schema126 = {"oneOf":[{"additionalProperties":false,"properties":{"children":{"items":{"$ref":"#/definitions/Node"},"type":"array"},"kind":{"const":"row","type":"string"},"size":{"allOf":[{"$ref":"#/definitions/Size"}],"default":{"kind":"fill"}}},"required":["kind","children"],"type":"object"},{"additionalProperties":false,"properties":{"children":{"items":{"$ref":"#/definitions/Node"},"type":"array"},"kind":{"const":"column","type":"string"},"size":{"allOf":[{"$ref":"#/definitions/Size"}],"default":{"kind":"fill"}}},"required":["kind","children"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"block","type":"string"},"region":{"$ref":"#/definitions/Region"},"size":{"allOf":[{"$ref":"#/definitions/Size"}],"default":{"kind":"fill"}}},"required":["kind","region"],"type":"object"}]};
const schema127 = {"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"fill","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"content","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"fixed","type":"string"},"pixels":{"maximum":4096,"minimum":1,"type":"integer"}},"required":["kind","pixels"],"type":"object"}]};
const schema129 = {"enum":["sidebar","fleet-strip","active-fleet","portals","context-bar"],"type":"string"};
const wrapper6 = {validate: validate72};

function validate72(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(errors === _errs1){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((data.kind === undefined) && (missing0 = "kind")) || ((data.children === undefined) && (missing0 = "children"))){
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
if(!(((key0 === "children") || (key0 === "kind")) || (key0 === "size"))){
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
if(data.children !== undefined){
let data0 = data.children;
const _errs4 = errors;
if(errors === _errs4){
if(Array.isArray(data0)){
var valid2 = true;
const len0 = data0.length;
for(let i0=0; i0<len0; i0++){
const _errs6 = errors;
if(!(wrapper6.validate(data0[i0], {instancePath:instancePath+"/children/" + i0,parentData:data0,parentDataProperty:i0,rootData}))){
vErrors = vErrors === null ? wrapper6.validate.errors : vErrors.concat(wrapper6.validate.errors);
errors = vErrors.length;
}
var valid2 = _errs6 === errors;
if(!valid2){
break;
}
}
}
else {
const err2 = {instancePath:instancePath+"/children",schemaPath:"#/oneOf/0/properties/children/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
var valid1 = _errs4 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.kind !== undefined){
let data2 = data.kind;
const _errs7 = errors;
if(typeof data2 !== "string"){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if("row" !== data2){
const err4 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "row"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
var valid1 = _errs7 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.size !== undefined){
let data3 = data.size;
const _errs9 = errors;
const _errs12 = errors;
let valid5 = false;
let passing1 = null;
const _errs13 = errors;
if(errors === _errs13){
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
let missing1;
if((data3.kind === undefined) && (missing1 = "kind")){
const err5 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
else {
const _errs15 = errors;
for(const key1 in data3){
if(!(key1 === "kind")){
const err6 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
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
if(_errs15 === errors){
if(data3.kind !== undefined){
let data4 = data3.kind;
if(typeof data4 !== "string"){
const err7 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if("fill" !== data4){
const err8 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "fill"},message:"must be equal to constant"};
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
const err9 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
var _valid1 = _errs13 === errors;
if(_valid1){
valid5 = true;
passing1 = 0;
}
const _errs18 = errors;
if(errors === _errs18){
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
let missing2;
if((data3.kind === undefined) && (missing2 = "kind")){
const err10 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
else {
const _errs20 = errors;
for(const key2 in data3){
if(!(key2 === "kind")){
const err11 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
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
if(_errs20 === errors){
if(data3.kind !== undefined){
let data5 = data3.kind;
if(typeof data5 !== "string"){
const err12 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if("content" !== data5){
const err13 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "content"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
}
}
else {
const err14 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
var _valid1 = _errs18 === errors;
if(_valid1 && valid5){
valid5 = false;
passing1 = [passing1, 1];
}
else {
if(_valid1){
valid5 = true;
passing1 = 1;
}
const _errs23 = errors;
if(errors === _errs23){
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
let missing3;
if(((data3.kind === undefined) && (missing3 = "kind")) || ((data3.pixels === undefined) && (missing3 = "pixels"))){
const err15 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/required",keyword:"required",params:{missingProperty: missing3},message:"must have required property '"+missing3+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
else {
const _errs25 = errors;
for(const key3 in data3){
if(!((key3 === "kind") || (key3 === "pixels"))){
const err16 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
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
if(_errs25 === errors){
if(data3.kind !== undefined){
let data6 = data3.kind;
const _errs26 = errors;
if(typeof data6 !== "string"){
const err17 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if("fixed" !== data6){
const err18 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "fixed"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
var valid8 = _errs26 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data3.pixels !== undefined){
let data7 = data3.pixels;
const _errs28 = errors;
if(!(((typeof data7 == "number") && (!(data7 % 1) && !isNaN(data7))) && (isFinite(data7)))){
const err19 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(errors === _errs28){
if((typeof data7 == "number") && (isFinite(data7))){
if(data7 > 4096 || isNaN(data7)){
const err20 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/maximum",keyword:"maximum",params:{comparison: "<=", limit: 4096},message:"must be <= 4096"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
else {
if(data7 < 1 || isNaN(data7)){
const err21 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
}
}
var valid8 = _errs28 === errors;
}
else {
var valid8 = true;
}
}
}
}
}
else {
const err22 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
var _valid1 = _errs23 === errors;
if(_valid1 && valid5){
valid5 = false;
passing1 = [passing1, 2];
}
else {
if(_valid1){
valid5 = true;
passing1 = 2;
}
}
}
if(!valid5){
const err23 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf",keyword:"oneOf",params:{passingSchemas: passing1},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
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
var valid1 = _errs9 === errors;
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
const err24 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
}
const _errs30 = errors;
if(errors === _errs30){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing4;
if(((data.kind === undefined) && (missing4 = "kind")) || ((data.children === undefined) && (missing4 = "children"))){
const err25 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: missing4},message:"must have required property '"+missing4+"'"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
else {
const _errs32 = errors;
for(const key4 in data){
if(!(((key4 === "children") || (key4 === "kind")) || (key4 === "size"))){
const err26 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
break;
}
}
if(_errs32 === errors){
if(data.children !== undefined){
let data8 = data.children;
const _errs33 = errors;
if(errors === _errs33){
if(Array.isArray(data8)){
var valid10 = true;
const len1 = data8.length;
for(let i1=0; i1<len1; i1++){
const _errs35 = errors;
if(!(wrapper6.validate(data8[i1], {instancePath:instancePath+"/children/" + i1,parentData:data8,parentDataProperty:i1,rootData}))){
vErrors = vErrors === null ? wrapper6.validate.errors : vErrors.concat(wrapper6.validate.errors);
errors = vErrors.length;
}
var valid10 = _errs35 === errors;
if(!valid10){
break;
}
}
}
else {
const err27 = {instancePath:instancePath+"/children",schemaPath:"#/oneOf/1/properties/children/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
var valid9 = _errs33 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data.kind !== undefined){
let data10 = data.kind;
const _errs36 = errors;
if(typeof data10 !== "string"){
const err28 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if("column" !== data10){
const err29 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "column"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
var valid9 = _errs36 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data.size !== undefined){
let data11 = data.size;
const _errs38 = errors;
const _errs41 = errors;
let valid13 = false;
let passing2 = null;
const _errs42 = errors;
if(errors === _errs42){
if(data11 && typeof data11 == "object" && !Array.isArray(data11)){
let missing5;
if((data11.kind === undefined) && (missing5 = "kind")){
const err30 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/required",keyword:"required",params:{missingProperty: missing5},message:"must have required property '"+missing5+"'"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
else {
const _errs44 = errors;
for(const key5 in data11){
if(!(key5 === "kind")){
const err31 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
break;
}
}
if(_errs44 === errors){
if(data11.kind !== undefined){
let data12 = data11.kind;
if(typeof data12 !== "string"){
const err32 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
if("fill" !== data12){
const err33 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "fill"},message:"must be equal to constant"};
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
}
else {
const err34 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
var _valid2 = _errs42 === errors;
if(_valid2){
valid13 = true;
passing2 = 0;
}
const _errs47 = errors;
if(errors === _errs47){
if(data11 && typeof data11 == "object" && !Array.isArray(data11)){
let missing6;
if((data11.kind === undefined) && (missing6 = "kind")){
const err35 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/required",keyword:"required",params:{missingProperty: missing6},message:"must have required property '"+missing6+"'"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
else {
const _errs49 = errors;
for(const key6 in data11){
if(!(key6 === "kind")){
const err36 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
break;
}
}
if(_errs49 === errors){
if(data11.kind !== undefined){
let data13 = data11.kind;
if(typeof data13 !== "string"){
const err37 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
if("content" !== data13){
const err38 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "content"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
}
}
}
else {
const err39 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
var _valid2 = _errs47 === errors;
if(_valid2 && valid13){
valid13 = false;
passing2 = [passing2, 1];
}
else {
if(_valid2){
valid13 = true;
passing2 = 1;
}
const _errs52 = errors;
if(errors === _errs52){
if(data11 && typeof data11 == "object" && !Array.isArray(data11)){
let missing7;
if(((data11.kind === undefined) && (missing7 = "kind")) || ((data11.pixels === undefined) && (missing7 = "pixels"))){
const err40 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/required",keyword:"required",params:{missingProperty: missing7},message:"must have required property '"+missing7+"'"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
else {
const _errs54 = errors;
for(const key7 in data11){
if(!((key7 === "kind") || (key7 === "pixels"))){
const err41 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key7},message:"must NOT have additional properties"};
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
if(_errs54 === errors){
if(data11.kind !== undefined){
let data14 = data11.kind;
const _errs55 = errors;
if(typeof data14 !== "string"){
const err42 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
if("fixed" !== data14){
const err43 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "fixed"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
var valid16 = _errs55 === errors;
}
else {
var valid16 = true;
}
if(valid16){
if(data11.pixels !== undefined){
let data15 = data11.pixels;
const _errs57 = errors;
if(!(((typeof data15 == "number") && (!(data15 % 1) && !isNaN(data15))) && (isFinite(data15)))){
const err44 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
if(errors === _errs57){
if((typeof data15 == "number") && (isFinite(data15))){
if(data15 > 4096 || isNaN(data15)){
const err45 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/maximum",keyword:"maximum",params:{comparison: "<=", limit: 4096},message:"must be <= 4096"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
else {
if(data15 < 1 || isNaN(data15)){
const err46 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
}
}
var valid16 = _errs57 === errors;
}
else {
var valid16 = true;
}
}
}
}
}
else {
const err47 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
}
var _valid2 = _errs52 === errors;
if(_valid2 && valid13){
valid13 = false;
passing2 = [passing2, 2];
}
else {
if(_valid2){
valid13 = true;
passing2 = 2;
}
}
}
if(!valid13){
const err48 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf",keyword:"oneOf",params:{passingSchemas: passing2},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
else {
errors = _errs41;
if(vErrors !== null){
if(_errs41){
vErrors.length = _errs41;
}
else {
vErrors = null;
}
}
}
var valid9 = _errs38 === errors;
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
const err49 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
var _valid0 = _errs30 === errors;
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
let missing8;
if(((data.kind === undefined) && (missing8 = "kind")) || ((data.region === undefined) && (missing8 = "region"))){
const err50 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: missing8},message:"must have required property '"+missing8+"'"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
else {
const _errs61 = errors;
for(const key8 in data){
if(!(((key8 === "kind") || (key8 === "region")) || (key8 === "size"))){
const err51 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key8},message:"must NOT have additional properties"};
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
if(_errs61 === errors){
if(data.kind !== undefined){
let data16 = data.kind;
const _errs62 = errors;
if(typeof data16 !== "string"){
const err52 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
if("block" !== data16){
const err53 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "block"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
var valid17 = _errs62 === errors;
}
else {
var valid17 = true;
}
if(valid17){
if(data.region !== undefined){
let data17 = data.region;
const _errs64 = errors;
if(typeof data17 !== "string"){
const err54 = {instancePath:instancePath+"/region",schemaPath:"#/definitions/Region/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
if(!(((((data17 === "sidebar") || (data17 === "fleet-strip")) || (data17 === "active-fleet")) || (data17 === "portals")) || (data17 === "context-bar"))){
const err55 = {instancePath:instancePath+"/region",schemaPath:"#/definitions/Region/enum",keyword:"enum",params:{allowedValues: schema129.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
var valid17 = _errs64 === errors;
}
else {
var valid17 = true;
}
if(valid17){
if(data.size !== undefined){
let data18 = data.size;
const _errs67 = errors;
const _errs70 = errors;
let valid21 = false;
let passing3 = null;
const _errs71 = errors;
if(errors === _errs71){
if(data18 && typeof data18 == "object" && !Array.isArray(data18)){
let missing9;
if((data18.kind === undefined) && (missing9 = "kind")){
const err56 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/required",keyword:"required",params:{missingProperty: missing9},message:"must have required property '"+missing9+"'"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
else {
const _errs73 = errors;
for(const key9 in data18){
if(!(key9 === "kind")){
const err57 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key9},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
break;
}
}
if(_errs73 === errors){
if(data18.kind !== undefined){
let data19 = data18.kind;
if(typeof data19 !== "string"){
const err58 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
if("fill" !== data19){
const err59 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "fill"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
}
}
}
}
else {
const err60 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
var _valid3 = _errs71 === errors;
if(_valid3){
valid21 = true;
passing3 = 0;
}
const _errs76 = errors;
if(errors === _errs76){
if(data18 && typeof data18 == "object" && !Array.isArray(data18)){
let missing10;
if((data18.kind === undefined) && (missing10 = "kind")){
const err61 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/required",keyword:"required",params:{missingProperty: missing10},message:"must have required property '"+missing10+"'"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
else {
const _errs78 = errors;
for(const key10 in data18){
if(!(key10 === "kind")){
const err62 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key10},message:"must NOT have additional properties"};
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
if(_errs78 === errors){
if(data18.kind !== undefined){
let data20 = data18.kind;
if(typeof data20 !== "string"){
const err63 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
if("content" !== data20){
const err64 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "content"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
}
}
}
}
else {
const err65 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
}
var _valid3 = _errs76 === errors;
if(_valid3 && valid21){
valid21 = false;
passing3 = [passing3, 1];
}
else {
if(_valid3){
valid21 = true;
passing3 = 1;
}
const _errs81 = errors;
if(errors === _errs81){
if(data18 && typeof data18 == "object" && !Array.isArray(data18)){
let missing11;
if(((data18.kind === undefined) && (missing11 = "kind")) || ((data18.pixels === undefined) && (missing11 = "pixels"))){
const err66 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/required",keyword:"required",params:{missingProperty: missing11},message:"must have required property '"+missing11+"'"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
else {
const _errs83 = errors;
for(const key11 in data18){
if(!((key11 === "kind") || (key11 === "pixels"))){
const err67 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key11},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
break;
}
}
if(_errs83 === errors){
if(data18.kind !== undefined){
let data21 = data18.kind;
const _errs84 = errors;
if(typeof data21 !== "string"){
const err68 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
if("fixed" !== data21){
const err69 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "fixed"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
var valid24 = _errs84 === errors;
}
else {
var valid24 = true;
}
if(valid24){
if(data18.pixels !== undefined){
let data22 = data18.pixels;
const _errs86 = errors;
if(!(((typeof data22 == "number") && (!(data22 % 1) && !isNaN(data22))) && (isFinite(data22)))){
const err70 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
if(errors === _errs86){
if((typeof data22 == "number") && (isFinite(data22))){
if(data22 > 4096 || isNaN(data22)){
const err71 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/maximum",keyword:"maximum",params:{comparison: "<=", limit: 4096},message:"must be <= 4096"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
else {
if(data22 < 1 || isNaN(data22)){
const err72 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
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
var valid24 = _errs86 === errors;
}
else {
var valid24 = true;
}
}
}
}
}
else {
const err73 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
}
var _valid3 = _errs81 === errors;
if(_valid3 && valid21){
valid21 = false;
passing3 = [passing3, 2];
}
else {
if(_valid3){
valid21 = true;
passing3 = 2;
}
}
}
if(!valid21){
const err74 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf",keyword:"oneOf",params:{passingSchemas: passing3},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
else {
errors = _errs70;
if(vErrors !== null){
if(_errs70){
vErrors.length = _errs70;
}
else {
vErrors = null;
}
}
}
var valid17 = _errs67 === errors;
}
else {
var valid17 = true;
}
}
}
}
}
}
else {
const err75 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
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
}
}
if(!valid0){
const err76 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
validate72.errors = vErrors;
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
validate72.errors = vErrors;
return errors === 0;
}


function validate71(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((data.root === undefined) && (missing0 = "root")){
validate71.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(((key0 === "portalMode") || (key0 === "root")) || (key0 === "sidebarCollapsed"))){
validate71.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.portalMode !== undefined){
let data0 = data.portalMode;
const _errs2 = errors;
if(typeof data0 !== "string"){
validate71.errors = [{instancePath:instancePath+"/portalMode",schemaPath:"#/definitions/PortalMode/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!((data0 === "overlay") || (data0 === "make-room"))){
validate71.errors = [{instancePath:instancePath+"/portalMode",schemaPath:"#/definitions/PortalMode/enum",keyword:"enum",params:{allowedValues: schema125.enum},message:"must be equal to one of the allowed values"}];
return false;
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.root !== undefined){
const _errs6 = errors;
if(!(validate72(data.root, {instancePath:instancePath+"/root",parentData:data,parentDataProperty:"root",rootData}))){
vErrors = vErrors === null ? validate72.errors : vErrors.concat(validate72.errors);
errors = vErrors.length;
}
var valid0 = _errs6 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.sidebarCollapsed !== undefined){
const _errs7 = errors;
if(typeof data.sidebarCollapsed !== "boolean"){
validate71.errors = [{instancePath:instancePath+"/sidebarCollapsed",schemaPath:"#/properties/sidebarCollapsed/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"}];
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
validate71.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate71.errors = vErrors;
return errors === 0;
}

const schema131 = {"additionalProperties":false,"properties":{"backend":{"type":["string","null"]},"cwd":{"type":"string"},"id":{"type":"string"},"launch":{"anyOf":[{"$ref":"#/definitions/Launch"},{"type":"null"}]},"startPending":{"type":["string","null"]},"typeId":{"type":"string"}},"required":["id","typeId","cwd"],"type":"object"};
const schema132 = {"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"terminal","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"effort":{"allOf":[{"$ref":"#/definitions/Effort"}],"default":"high"},"kind":{"const":"codex","type":"string"},"model":{"default":"gpt-6.1-sol","type":"string"},"permissions":{"allOf":[{"$ref":"#/definitions/Permissions"}],"default":"yolo"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"argv":{"items":{"type":"string"},"type":"array"},"kind":{"const":"program","type":"string"}},"required":["kind","argv"],"type":"object"}]};
const schema133 = {"enum":["low","medium","high","xhigh","max","ultra"],"type":"string"};
const schema134 = {"enum":["yolo","workspace-write","read-only"],"type":"string"};

function validate76(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(errors === _errs1){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((data.kind === undefined) && (missing0 = "kind")){
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
if(!(key0 === "kind")){
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
if("terminal" !== data0){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "terminal"},message:"must be equal to constant"};
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
if((data.kind === undefined) && (missing1 = "kind")){
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
if(!((((key1 === "effort") || (key1 === "kind")) || (key1 === "model")) || (key1 === "permissions"))){
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
if(data.effort !== undefined){
let data1 = data.effort;
const _errs9 = errors;
if(typeof data1 !== "string"){
const err7 = {instancePath:instancePath+"/effort",schemaPath:"#/definitions/Effort/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(!((((((data1 === "low") || (data1 === "medium")) || (data1 === "high")) || (data1 === "xhigh")) || (data1 === "max")) || (data1 === "ultra"))){
const err8 = {instancePath:instancePath+"/effort",schemaPath:"#/definitions/Effort/enum",keyword:"enum",params:{allowedValues: schema133.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
var valid2 = _errs9 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data.kind !== undefined){
let data2 = data.kind;
const _errs13 = errors;
if(typeof data2 !== "string"){
const err9 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if("codex" !== data2){
const err10 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "codex"},message:"must be equal to constant"};
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
if(valid2){
if(data.model !== undefined){
const _errs15 = errors;
if(typeof data.model !== "string"){
const err11 = {instancePath:instancePath+"/model",schemaPath:"#/oneOf/1/properties/model/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
if(data.permissions !== undefined){
let data4 = data.permissions;
const _errs17 = errors;
if(typeof data4 !== "string"){
const err12 = {instancePath:instancePath+"/permissions",schemaPath:"#/definitions/Permissions/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(!(((data4 === "yolo") || (data4 === "workspace-write")) || (data4 === "read-only"))){
const err13 = {instancePath:instancePath+"/permissions",schemaPath:"#/definitions/Permissions/enum",keyword:"enum",params:{allowedValues: schema134.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
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
const _errs21 = errors;
if(errors === _errs21){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing2;
if(((data.kind === undefined) && (missing2 = "kind")) || ((data.argv === undefined) && (missing2 = "argv"))){
const err15 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"};
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
for(const key2 in data){
if(!((key2 === "argv") || (key2 === "kind"))){
const err16 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
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
if(data.argv !== undefined){
let data5 = data.argv;
const _errs24 = errors;
if(errors === _errs24){
if(Array.isArray(data5)){
var valid8 = true;
const len0 = data5.length;
for(let i0=0; i0<len0; i0++){
const _errs26 = errors;
if(typeof data5[i0] !== "string"){
const err17 = {instancePath:instancePath+"/argv/" + i0,schemaPath:"#/oneOf/2/properties/argv/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
var valid8 = _errs26 === errors;
if(!valid8){
break;
}
}
}
else {
const err18 = {instancePath:instancePath+"/argv",schemaPath:"#/oneOf/2/properties/argv/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
var valid7 = _errs24 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data.kind !== undefined){
let data7 = data.kind;
const _errs28 = errors;
if(typeof data7 !== "string"){
const err19 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if("program" !== data7){
const err20 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "program"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
var valid7 = _errs28 === errors;
}
else {
var valid7 = true;
}
}
}
}
}
else {
const err21 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
var _valid0 = _errs21 === errors;
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
const err22 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
validate76.errors = vErrors;
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
validate76.errors = vErrors;
return errors === 0;
}


function validate75(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((((data.id === undefined) && (missing0 = "id")) || ((data.typeId === undefined) && (missing0 = "typeId"))) || ((data.cwd === undefined) && (missing0 = "cwd"))){
validate75.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((((((key0 === "backend") || (key0 === "cwd")) || (key0 === "id")) || (key0 === "launch")) || (key0 === "startPending")) || (key0 === "typeId"))){
validate75.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.backend !== undefined){
let data0 = data.backend;
const _errs2 = errors;
if((typeof data0 !== "string") && (data0 !== null)){
validate75.errors = [{instancePath:instancePath+"/backend",schemaPath:"#/properties/backend/type",keyword:"type",params:{type: schema131.properties.backend.type},message:"must be string,null"}];
return false;
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.cwd !== undefined){
const _errs4 = errors;
if(typeof data.cwd !== "string"){
validate75.errors = [{instancePath:instancePath+"/cwd",schemaPath:"#/properties/cwd/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs4 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.id !== undefined){
const _errs6 = errors;
if(typeof data.id !== "string"){
validate75.errors = [{instancePath:instancePath+"/id",schemaPath:"#/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs6 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.launch !== undefined){
let data3 = data.launch;
const _errs8 = errors;
const _errs9 = errors;
let valid1 = false;
const _errs10 = errors;
if(!(validate76(data3, {instancePath:instancePath+"/launch",parentData:data,parentDataProperty:"launch",rootData}))){
vErrors = vErrors === null ? validate76.errors : vErrors.concat(validate76.errors);
errors = vErrors.length;
}
var _valid0 = _errs10 === errors;
valid1 = valid1 || _valid0;
if(!valid1){
const _errs11 = errors;
if(data3 !== null){
const err0 = {instancePath:instancePath+"/launch",schemaPath:"#/properties/launch/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
var _valid0 = _errs11 === errors;
valid1 = valid1 || _valid0;
}
if(!valid1){
const err1 = {instancePath:instancePath+"/launch",schemaPath:"#/properties/launch/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
validate75.errors = vErrors;
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
var valid0 = _errs8 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.startPending !== undefined){
let data4 = data.startPending;
const _errs13 = errors;
if((typeof data4 !== "string") && (data4 !== null)){
validate75.errors = [{instancePath:instancePath+"/startPending",schemaPath:"#/properties/startPending/type",keyword:"type",params:{type: schema131.properties.startPending.type},message:"must be string,null"}];
return false;
}
var valid0 = _errs13 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.typeId !== undefined){
const _errs15 = errors;
if(typeof data.typeId !== "string"){
validate75.errors = [{instancePath:instancePath+"/typeId",schemaPath:"#/properties/typeId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs15 === errors;
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
validate75.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate75.errors = vErrors;
return errors === 0;
}

const schema136 = {"additionalProperties":false,"properties":{"fleet":{"type":"string"},"name":{"type":"string"},"root":{"$ref":"#/definitions/Split"}},"required":["fleet","name","root"],"type":"object"};
const schema137 = {"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"leaf","type":"string"},"placement":{"type":"string"}},"required":["kind","placement"],"type":"object"},{"additionalProperties":false,"properties":{"axis":{"$ref":"#/definitions/Axis"},"first":{"$ref":"#/definitions/Split"},"kind":{"const":"branch","type":"string"},"second":{"$ref":"#/definitions/Split"},"share":{"allOf":[{"$ref":"#/definitions/SplitShare"}],"default":5000}},"required":["kind","axis","first","second"],"type":"object"}]};
const schema138 = {"enum":["horizontal","vertical"],"type":"string"};
const schema139 = {"maximum":9999,"minimum":1,"type":"integer"};
const wrapper8 = {validate: validate80};

function validate80(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
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
const err9 = {instancePath:instancePath+"/axis",schemaPath:"#/definitions/Axis/enum",keyword:"enum",params:{allowedValues: schema138.enum},message:"must be equal to one of the allowed values"};
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
if(!(wrapper8.validate(data.first, {instancePath:instancePath+"/first",parentData:data,parentDataProperty:"first",rootData}))){
vErrors = vErrors === null ? wrapper8.validate.errors : vErrors.concat(wrapper8.validate.errors);
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
if(!(wrapper8.validate(data.second, {instancePath:instancePath+"/second",parentData:data,parentDataProperty:"second",rootData}))){
vErrors = vErrors === null ? wrapper8.validate.errors : vErrors.concat(wrapper8.validate.errors);
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
validate80.errors = vErrors;
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
validate80.errors = vErrors;
return errors === 0;
}


function validate79(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((((data.fleet === undefined) && (missing0 = "fleet")) || ((data.name === undefined) && (missing0 = "name"))) || ((data.root === undefined) && (missing0 = "root"))){
validate79.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(((key0 === "fleet") || (key0 === "name")) || (key0 === "root"))){
validate79.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.fleet !== undefined){
const _errs2 = errors;
if(typeof data.fleet !== "string"){
validate79.errors = [{instancePath:instancePath+"/fleet",schemaPath:"#/properties/fleet/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate79.errors = [{instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
if(!(validate80(data.root, {instancePath:instancePath+"/root",parentData:data,parentDataProperty:"root",rootData}))){
vErrors = vErrors === null ? validate80.errors : vErrors.concat(validate80.errors);
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
validate79.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate79.errors = vErrors;
return errors === 0;
}

const schema141 = {"additionalProperties":false,"properties":{"fleets":{"items":{"$ref":"#/definitions/Fleet"},"type":"array"},"id":{"type":"string"},"name":{"type":"string"},"portals":{"items":{"$ref":"#/definitions/Vessel"},"type":"array"}},"required":["id","name","fleets","portals"],"type":"object"};
const schema143 = {"additionalProperties":false,"properties":{"content":{"type":"string"},"id":{"type":"string"},"name":{"type":["string","null"]}},"required":["id","content"],"type":"object"};
const schema142 = {"additionalProperties":false,"properties":{"id":{"type":"string"},"name":{"type":"string"},"root":{"$ref":"#/definitions/Split"},"vessels":{"items":{"$ref":"#/definitions/Vessel"},"type":"array"}},"required":["id","name","vessels","root"],"type":"object"};

function validate84(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((((data.id === undefined) && (missing0 = "id")) || ((data.name === undefined) && (missing0 = "name"))) || ((data.vessels === undefined) && (missing0 = "vessels"))) || ((data.root === undefined) && (missing0 = "root"))){
validate84.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((((key0 === "id") || (key0 === "name")) || (key0 === "root")) || (key0 === "vessels"))){
validate84.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.id !== undefined){
const _errs2 = errors;
if(typeof data.id !== "string"){
validate84.errors = [{instancePath:instancePath+"/id",schemaPath:"#/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate84.errors = [{instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
if(!(validate80(data.root, {instancePath:instancePath+"/root",parentData:data,parentDataProperty:"root",rootData}))){
vErrors = vErrors === null ? validate80.errors : vErrors.concat(validate80.errors);
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
validate84.errors = [{instancePath:instancePath+"/vessels/" + i0,schemaPath:"#/definitions/Vessel/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"}];
return false;
}
else {
const _errs12 = errors;
for(const key1 in data4){
if(!(((key1 === "content") || (key1 === "id")) || (key1 === "name"))){
validate84.errors = [{instancePath:instancePath+"/vessels/" + i0,schemaPath:"#/definitions/Vessel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs12 === errors){
if(data4.content !== undefined){
const _errs13 = errors;
if(typeof data4.content !== "string"){
validate84.errors = [{instancePath:instancePath+"/vessels/" + i0+"/content",schemaPath:"#/definitions/Vessel/properties/content/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate84.errors = [{instancePath:instancePath+"/vessels/" + i0+"/id",schemaPath:"#/definitions/Vessel/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate84.errors = [{instancePath:instancePath+"/vessels/" + i0+"/name",schemaPath:"#/definitions/Vessel/properties/name/type",keyword:"type",params:{type: schema143.properties.name.type},message:"must be string,null"}];
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
validate84.errors = [{instancePath:instancePath+"/vessels/" + i0,schemaPath:"#/definitions/Vessel/type",keyword:"type",params:{type: "object"},message:"must be object"}];
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
validate84.errors = [{instancePath:instancePath+"/vessels",schemaPath:"#/properties/vessels/type",keyword:"type",params:{type: "array"},message:"must be array"}];
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
validate84.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate84.errors = vErrors;
return errors === 0;
}


function validate83(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((((data.id === undefined) && (missing0 = "id")) || ((data.name === undefined) && (missing0 = "name"))) || ((data.fleets === undefined) && (missing0 = "fleets"))) || ((data.portals === undefined) && (missing0 = "portals"))){
validate83.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((((key0 === "fleets") || (key0 === "id")) || (key0 === "name")) || (key0 === "portals"))){
validate83.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
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
if(!(validate84(data0[i0], {instancePath:instancePath+"/fleets/" + i0,parentData:data0,parentDataProperty:i0,rootData}))){
vErrors = vErrors === null ? validate84.errors : vErrors.concat(validate84.errors);
errors = vErrors.length;
}
var valid1 = _errs4 === errors;
if(!valid1){
break;
}
}
}
else {
validate83.errors = [{instancePath:instancePath+"/fleets",schemaPath:"#/properties/fleets/type",keyword:"type",params:{type: "array"},message:"must be array"}];
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
validate83.errors = [{instancePath:instancePath+"/id",schemaPath:"#/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate83.errors = [{instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate83.errors = [{instancePath:instancePath+"/portals/" + i1,schemaPath:"#/definitions/Vessel/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"}];
return false;
}
else {
const _errs14 = errors;
for(const key1 in data5){
if(!(((key1 === "content") || (key1 === "id")) || (key1 === "name"))){
validate83.errors = [{instancePath:instancePath+"/portals/" + i1,schemaPath:"#/definitions/Vessel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs14 === errors){
if(data5.content !== undefined){
const _errs15 = errors;
if(typeof data5.content !== "string"){
validate83.errors = [{instancePath:instancePath+"/portals/" + i1+"/content",schemaPath:"#/definitions/Vessel/properties/content/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate83.errors = [{instancePath:instancePath+"/portals/" + i1+"/id",schemaPath:"#/definitions/Vessel/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate83.errors = [{instancePath:instancePath+"/portals/" + i1+"/name",schemaPath:"#/definitions/Vessel/properties/name/type",keyword:"type",params:{type: schema143.properties.name.type},message:"must be string,null"}];
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
validate83.errors = [{instancePath:instancePath+"/portals/" + i1,schemaPath:"#/definitions/Vessel/type",keyword:"type",params:{type: "object"},message:"must be object"}];
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
validate83.errors = [{instancePath:instancePath+"/portals",schemaPath:"#/properties/portals/type",keyword:"type",params:{type: "array"},message:"must be array"}];
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
validate83.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate83.errors = vErrors;
return errors === 0;
}


function validate70(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((((data.voyages === undefined) && (missing0 = "voyages")) || ((data.contents === undefined) && (missing0 = "contents"))) || ((data.context === undefined) && (missing0 = "context"))) || ((data.nextId === undefined) && (missing0 = "nextId"))){
validate70.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(func2.call(schema123.properties, key0))){
validate70.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.canvas !== undefined){
const _errs2 = errors;
if(!(validate71(data.canvas, {instancePath:instancePath+"/canvas",parentData:data,parentDataProperty:"canvas",rootData}))){
vErrors = vErrors === null ? validate71.errors : vErrors.concat(validate71.errors);
errors = vErrors.length;
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.contents !== undefined){
let data1 = data.contents;
const _errs4 = errors;
if(errors === _errs4){
if(Array.isArray(data1)){
var valid2 = true;
const len0 = data1.length;
for(let i0=0; i0<len0; i0++){
const _errs6 = errors;
if(!(validate75(data1[i0], {instancePath:instancePath+"/contents/" + i0,parentData:data1,parentDataProperty:i0,rootData}))){
vErrors = vErrors === null ? validate75.errors : vErrors.concat(validate75.errors);
errors = vErrors.length;
}
var valid2 = _errs6 === errors;
if(!valid2){
break;
}
}
}
else {
validate70.errors = [{instancePath:instancePath+"/contents",schemaPath:"#/properties/contents/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
var valid0 = _errs4 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.context !== undefined){
let data3 = data.context;
const _errs7 = errors;
const _errs9 = errors;
let valid4 = false;
let passing0 = null;
const _errs10 = errors;
if(errors === _errs10){
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
let missing1;
if((data3.kind === undefined) && (missing1 = "kind")){
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
const _errs12 = errors;
for(const key1 in data3){
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
if(_errs12 === errors){
if(data3.kind !== undefined){
let data4 = data3.kind;
if(typeof data4 !== "string"){
const err2 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if("workspace" !== data4){
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
var _valid0 = _errs10 === errors;
if(_valid0){
valid4 = true;
passing0 = 0;
}
const _errs15 = errors;
if(errors === _errs15){
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
let missing2;
if(((data3.kind === undefined) && (missing2 = "kind")) || ((data3.id === undefined) && (missing2 = "id"))){
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
const _errs17 = errors;
for(const key2 in data3){
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
if(_errs17 === errors){
if(data3.id !== undefined){
const _errs18 = errors;
if(typeof data3.id !== "string"){
const err7 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/1/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
var valid6 = _errs18 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data3.kind !== undefined){
let data6 = data3.kind;
const _errs20 = errors;
if(typeof data6 !== "string"){
const err8 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if("voyage" !== data6){
const err9 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
var valid6 = _errs20 === errors;
}
else {
var valid6 = true;
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
var _valid0 = _errs15 === errors;
if(_valid0 && valid4){
valid4 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid4 = true;
passing0 = 1;
}
const _errs22 = errors;
if(errors === _errs22){
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
let missing3;
if(((data3.kind === undefined) && (missing3 = "kind")) || ((data3.id === undefined) && (missing3 = "id"))){
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
const _errs24 = errors;
for(const key3 in data3){
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
if(_errs24 === errors){
if(data3.id !== undefined){
const _errs25 = errors;
if(typeof data3.id !== "string"){
const err13 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/2/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
var valid7 = _errs25 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data3.kind !== undefined){
let data8 = data3.kind;
const _errs27 = errors;
if(typeof data8 !== "string"){
const err14 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if("fleet" !== data8){
const err15 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
var valid7 = _errs27 === errors;
}
else {
var valid7 = true;
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
var _valid0 = _errs22 === errors;
if(_valid0 && valid4){
valid4 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid4 = true;
passing0 = 2;
}
const _errs29 = errors;
if(errors === _errs29){
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
let missing4;
if(((data3.kind === undefined) && (missing4 = "kind")) || ((data3.id === undefined) && (missing4 = "id"))){
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
const _errs31 = errors;
for(const key4 in data3){
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
if(_errs31 === errors){
if(data3.id !== undefined){
const _errs32 = errors;
if(typeof data3.id !== "string"){
const err19 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/3/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
var valid8 = _errs32 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data3.kind !== undefined){
let data10 = data3.kind;
const _errs34 = errors;
if(typeof data10 !== "string"){
const err20 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/3/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if("vessel" !== data10){
const err21 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/3/properties/kind/const",keyword:"const",params:{allowedValue: "vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
var valid8 = _errs34 === errors;
}
else {
var valid8 = true;
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
var _valid0 = _errs29 === errors;
if(_valid0 && valid4){
valid4 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid4 = true;
passing0 = 3;
}
const _errs36 = errors;
if(errors === _errs36){
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
let missing5;
if(((data3.kind === undefined) && (missing5 = "kind")) || ((data3.id === undefined) && (missing5 = "id"))){
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
const _errs38 = errors;
for(const key5 in data3){
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
if(_errs38 === errors){
if(data3.id !== undefined){
const _errs39 = errors;
if(typeof data3.id !== "string"){
const err25 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/4/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
var valid9 = _errs39 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data3.kind !== undefined){
let data12 = data3.kind;
const _errs41 = errors;
if(typeof data12 !== "string"){
const err26 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/4/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if("portal" !== data12){
const err27 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/4/properties/kind/const",keyword:"const",params:{allowedValue: "portal"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
var valid9 = _errs41 === errors;
}
else {
var valid9 = true;
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
var _valid0 = _errs36 === errors;
if(_valid0 && valid4){
valid4 = false;
passing0 = [passing0, 4];
}
else {
if(_valid0){
valid4 = true;
passing0 = 4;
}
}
}
}
}
if(!valid4){
const err29 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
validate70.errors = vErrors;
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
var valid0 = _errs7 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.nextId !== undefined){
const _errs43 = errors;
if(typeof data.nextId !== "string"){
validate70.errors = [{instancePath:instancePath+"/nextId",schemaPath:"#/properties/nextId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs43 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.savedLayouts !== undefined){
let data14 = data.savedLayouts;
const _errs45 = errors;
if(errors === _errs45){
if(Array.isArray(data14)){
var valid10 = true;
const len1 = data14.length;
for(let i1=0; i1<len1; i1++){
const _errs47 = errors;
if(!(validate79(data14[i1], {instancePath:instancePath+"/savedLayouts/" + i1,parentData:data14,parentDataProperty:i1,rootData}))){
vErrors = vErrors === null ? validate79.errors : vErrors.concat(validate79.errors);
errors = vErrors.length;
}
var valid10 = _errs47 === errors;
if(!valid10){
break;
}
}
}
else {
validate70.errors = [{instancePath:instancePath+"/savedLayouts",schemaPath:"#/properties/savedLayouts/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
var valid0 = _errs45 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.selectedFleet !== undefined){
let data16 = data.selectedFleet;
const _errs48 = errors;
if((typeof data16 !== "string") && (data16 !== null)){
validate70.errors = [{instancePath:instancePath+"/selectedFleet",schemaPath:"#/properties/selectedFleet/type",keyword:"type",params:{type: schema123.properties.selectedFleet.type},message:"must be string,null"}];
return false;
}
var valid0 = _errs48 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.selectedVoyage !== undefined){
let data17 = data.selectedVoyage;
const _errs50 = errors;
if((typeof data17 !== "string") && (data17 !== null)){
validate70.errors = [{instancePath:instancePath+"/selectedVoyage",schemaPath:"#/properties/selectedVoyage/type",keyword:"type",params:{type: schema123.properties.selectedVoyage.type},message:"must be string,null"}];
return false;
}
var valid0 = _errs50 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.view !== undefined){
let data18 = data.view;
const _errs52 = errors;
if(typeof data18 !== "string"){
validate70.errors = [{instancePath:instancePath+"/view",schemaPath:"#/definitions/WorkspaceView/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!((data18 === "home") || (data18 === "fleet"))){
validate70.errors = [{instancePath:instancePath+"/view",schemaPath:"#/definitions/WorkspaceView/enum",keyword:"enum",params:{allowedValues: schema140.enum},message:"must be equal to one of the allowed values"}];
return false;
}
var valid0 = _errs52 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.voyages !== undefined){
let data19 = data.voyages;
const _errs56 = errors;
if(errors === _errs56){
if(Array.isArray(data19)){
var valid13 = true;
const len2 = data19.length;
for(let i2=0; i2<len2; i2++){
const _errs58 = errors;
if(!(validate83(data19[i2], {instancePath:instancePath+"/voyages/" + i2,parentData:data19,parentDataProperty:i2,rootData}))){
vErrors = vErrors === null ? validate83.errors : vErrors.concat(validate83.errors);
errors = vErrors.length;
}
var valid13 = _errs58 === errors;
if(!valid13){
break;
}
}
}
else {
validate70.errors = [{instancePath:instancePath+"/voyages",schemaPath:"#/properties/voyages/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
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
}
}
}
}
}
}
}
else {
validate70.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate70.errors = vErrors;
return errors === 0;
}


function validate69(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((((((((data.requestId === undefined) && (missing0 = "requestId")) || ((data.status === undefined) && (missing0 = "status"))) || ((data.version === undefined) && (missing0 = "version"))) || ((data.layout === undefined) && (missing0 = "layout"))) || ((data.fresh === undefined) && (missing0 = "fresh"))) || ((data.createdWorkspace === undefined) && (missing0 = "createdWorkspace"))) || ((data.createdContents === undefined) && (missing0 = "createdContents"))){
validate69.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((((((((key0 === "createdContents") || (key0 === "createdWorkspace")) || (key0 === "fresh")) || (key0 === "layout")) || (key0 === "message")) || (key0 === "requestId")) || (key0 === "status")) || (key0 === "version"))){
validate69.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
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
validate69.errors = [{instancePath:instancePath+"/createdContents/" + i0,schemaPath:"#/properties/createdContents/items/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid1 = _errs4 === errors;
if(!valid1){
break;
}
}
}
else {
validate69.errors = [{instancePath:instancePath+"/createdContents",schemaPath:"#/properties/createdContents/type",keyword:"type",params:{type: "array"},message:"must be array"}];
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
validate69.errors = [{instancePath:instancePath+"/createdWorkspace",schemaPath:"#/properties/createdWorkspace/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"}];
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
validate69.errors = [{instancePath:instancePath+"/fresh",schemaPath:"#/properties/fresh/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"}];
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
if(!(validate70(data.layout, {instancePath:instancePath+"/layout",parentData:data,parentDataProperty:"layout",rootData}))){
vErrors = vErrors === null ? validate70.errors : vErrors.concat(validate70.errors);
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
validate69.errors = [{instancePath:instancePath+"/message",schemaPath:"#/properties/message/type",keyword:"type",params:{type: schema122.properties.message.type},message:"must be string,null"}];
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
validate69.errors = [{instancePath:instancePath+"/requestId",schemaPath:"#/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate69.errors = [{instancePath:instancePath+"/status",schemaPath:"#/definitions/Status/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!(((data7 === "applied") || (data7 === "rejected")) || (data7 === "uncertain"))){
validate69.errors = [{instancePath:instancePath+"/status",schemaPath:"#/definitions/Status/enum",keyword:"enum",params:{allowedValues: schema145.enum},message:"must be equal to one of the allowed values"}];
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
validate69.errors = [{instancePath:instancePath+"/version",schemaPath:"#/properties/version/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate69.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate69.errors = vErrors;
return errors === 0;
}

export const terminalRequest = validate89;
const schema146 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"properties":{"contentId":{"type":"string"},"expectedVersion":{"type":"string"},"requestId":{"type":"string"}},"required":["requestId","contentId","expectedVersion"],"title":"TerminalRequest","type":"object"};

function validate89(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((((data.requestId === undefined) && (missing0 = "requestId")) || ((data.contentId === undefined) && (missing0 = "contentId"))) || ((data.expectedVersion === undefined) && (missing0 = "expectedVersion"))){
validate89.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(((key0 === "contentId") || (key0 === "expectedVersion")) || (key0 === "requestId"))){
validate89.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.contentId !== undefined){
const _errs2 = errors;
if(typeof data.contentId !== "string"){
validate89.errors = [{instancePath:instancePath+"/contentId",schemaPath:"#/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate89.errors = [{instancePath:instancePath+"/expectedVersion",schemaPath:"#/properties/expectedVersion/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate89.errors = [{instancePath:instancePath+"/requestId",schemaPath:"#/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate89.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate89.errors = vErrors;
return errors === 0;
}

export const terminalResponse = validate90;
const schema147 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"definitions":{"Status":{"enum":["applied","rejected","uncertain"],"type":"string"}},"properties":{"contentId":{"type":"string"},"message":{"type":["string","null"]},"requestId":{"type":"string"},"status":{"$ref":"#/definitions/Status"}},"required":["requestId","contentId","status"],"title":"TerminalResponse","type":"object"};
const schema148 = {"enum":["applied","rejected","uncertain"],"type":"string"};

function validate90(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((((data.requestId === undefined) && (missing0 = "requestId")) || ((data.contentId === undefined) && (missing0 = "contentId"))) || ((data.status === undefined) && (missing0 = "status"))){
validate90.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((((key0 === "contentId") || (key0 === "message")) || (key0 === "requestId")) || (key0 === "status"))){
validate90.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.contentId !== undefined){
const _errs2 = errors;
if(typeof data.contentId !== "string"){
validate90.errors = [{instancePath:instancePath+"/contentId",schemaPath:"#/properties/contentId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate90.errors = [{instancePath:instancePath+"/message",schemaPath:"#/properties/message/type",keyword:"type",params:{type: schema147.properties.message.type},message:"must be string,null"}];
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
validate90.errors = [{instancePath:instancePath+"/requestId",schemaPath:"#/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate90.errors = [{instancePath:instancePath+"/status",schemaPath:"#/definitions/Status/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!(((data3 === "applied") || (data3 === "rejected")) || (data3 === "uncertain"))){
validate90.errors = [{instancePath:instancePath+"/status",schemaPath:"#/definitions/Status/enum",keyword:"enum",params:{allowedValues: schema148.enum},message:"must be equal to one of the allowed values"}];
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
validate90.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate90.errors = vErrors;
return errors === 0;
}

export const voiceState = validate91;
const schema149 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"definitions":{"Capability":{"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"checking","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"unavailable","type":"string"},"reason":{"type":"string"}},"required":["kind","reason"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"candidate","type":"string"},"version":{"type":"string"}},"required":["kind","version"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"compatible","type":"string"},"version":{"type":"string"}},"required":["kind","version"],"type":"object"}]},"Phase":{"enum":["off","preparing","negotiating","active","stopping","failed","unconfirmed"],"type":"string"}},"properties":{"capability":{"$ref":"#/definitions/Capability"},"error":{"type":["string","null"]},"generation":{"type":"string"},"microphonePeak":{"maximum":65535,"minimum":0,"type":"integer"},"phase":{"$ref":"#/definitions/Phase"},"realtimeSession":{"type":["string","null"]},"speakerPeak":{"maximum":65535,"minimum":0,"type":"integer"},"thread":{"type":["string","null"]},"turn":{"type":["string","null"]},"version":{"type":"string"}},"required":["version","generation","phase","capability","microphonePeak","speakerPeak"],"title":"State","type":"object"};
const schema150 = {"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"checking","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"unavailable","type":"string"},"reason":{"type":"string"}},"required":["kind","reason"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"candidate","type":"string"},"version":{"type":"string"}},"required":["kind","version"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"compatible","type":"string"},"version":{"type":"string"}},"required":["kind","version"],"type":"object"}]};
const schema151 = {"enum":["off","preparing","negotiating","active","stopping","failed","unconfirmed"],"type":"string"};

function validate91(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((((((data.version === undefined) && (missing0 = "version")) || ((data.generation === undefined) && (missing0 = "generation"))) || ((data.phase === undefined) && (missing0 = "phase"))) || ((data.capability === undefined) && (missing0 = "capability"))) || ((data.microphonePeak === undefined) && (missing0 = "microphonePeak"))) || ((data.speakerPeak === undefined) && (missing0 = "speakerPeak"))){
validate91.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(func2.call(schema149.properties, key0))){
validate91.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.capability !== undefined){
let data0 = data.capability;
const _errs2 = errors;
const _errs4 = errors;
let valid2 = false;
let passing0 = null;
const _errs5 = errors;
if(errors === _errs5){
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
let missing1;
if((data0.kind === undefined) && (missing1 = "kind")){
const err0 = {instancePath:instancePath+"/capability",schemaPath:"#/definitions/Capability/oneOf/0/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"};
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
if(!(key1 === "kind")){
const err1 = {instancePath:instancePath+"/capability",schemaPath:"#/definitions/Capability/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
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
if(data0.kind !== undefined){
let data1 = data0.kind;
if(typeof data1 !== "string"){
const err2 = {instancePath:instancePath+"/capability/kind",schemaPath:"#/definitions/Capability/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if("checking" !== data1){
const err3 = {instancePath:instancePath+"/capability/kind",schemaPath:"#/definitions/Capability/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "checking"},message:"must be equal to constant"};
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
const err4 = {instancePath:instancePath+"/capability",schemaPath:"#/definitions/Capability/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
if(((data0.kind === undefined) && (missing2 = "kind")) || ((data0.reason === undefined) && (missing2 = "reason"))){
const err5 = {instancePath:instancePath+"/capability",schemaPath:"#/definitions/Capability/oneOf/1/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"};
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
if(!((key2 === "kind") || (key2 === "reason"))){
const err6 = {instancePath:instancePath+"/capability",schemaPath:"#/definitions/Capability/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
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
if(data0.kind !== undefined){
let data2 = data0.kind;
const _errs13 = errors;
if(typeof data2 !== "string"){
const err7 = {instancePath:instancePath+"/capability/kind",schemaPath:"#/definitions/Capability/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if("unavailable" !== data2){
const err8 = {instancePath:instancePath+"/capability/kind",schemaPath:"#/definitions/Capability/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "unavailable"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
var valid4 = _errs13 === errors;
}
else {
var valid4 = true;
}
if(valid4){
if(data0.reason !== undefined){
const _errs15 = errors;
if(typeof data0.reason !== "string"){
const err9 = {instancePath:instancePath+"/capability/reason",schemaPath:"#/definitions/Capability/oneOf/1/properties/reason/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
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
const err10 = {instancePath:instancePath+"/capability",schemaPath:"#/definitions/Capability/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
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
const _errs17 = errors;
if(errors === _errs17){
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
let missing3;
if(((data0.kind === undefined) && (missing3 = "kind")) || ((data0.version === undefined) && (missing3 = "version"))){
const err11 = {instancePath:instancePath+"/capability",schemaPath:"#/definitions/Capability/oneOf/2/required",keyword:"required",params:{missingProperty: missing3},message:"must have required property '"+missing3+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
else {
const _errs19 = errors;
for(const key3 in data0){
if(!((key3 === "kind") || (key3 === "version"))){
const err12 = {instancePath:instancePath+"/capability",schemaPath:"#/definitions/Capability/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
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
if(_errs19 === errors){
if(data0.kind !== undefined){
let data4 = data0.kind;
const _errs20 = errors;
if(typeof data4 !== "string"){
const err13 = {instancePath:instancePath+"/capability/kind",schemaPath:"#/definitions/Capability/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if("candidate" !== data4){
const err14 = {instancePath:instancePath+"/capability/kind",schemaPath:"#/definitions/Capability/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "candidate"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
var valid5 = _errs20 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data0.version !== undefined){
const _errs22 = errors;
if(typeof data0.version !== "string"){
const err15 = {instancePath:instancePath+"/capability/version",schemaPath:"#/definitions/Capability/oneOf/2/properties/version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
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
const err16 = {instancePath:instancePath+"/capability",schemaPath:"#/definitions/Capability/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
var _valid0 = _errs17 === errors;
if(_valid0 && valid2){
valid2 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid2 = true;
passing0 = 2;
}
const _errs24 = errors;
if(errors === _errs24){
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
let missing4;
if(((data0.kind === undefined) && (missing4 = "kind")) || ((data0.version === undefined) && (missing4 = "version"))){
const err17 = {instancePath:instancePath+"/capability",schemaPath:"#/definitions/Capability/oneOf/3/required",keyword:"required",params:{missingProperty: missing4},message:"must have required property '"+missing4+"'"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
else {
const _errs26 = errors;
for(const key4 in data0){
if(!((key4 === "kind") || (key4 === "version"))){
const err18 = {instancePath:instancePath+"/capability",schemaPath:"#/definitions/Capability/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
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
if(_errs26 === errors){
if(data0.kind !== undefined){
let data6 = data0.kind;
const _errs27 = errors;
if(typeof data6 !== "string"){
const err19 = {instancePath:instancePath+"/capability/kind",schemaPath:"#/definitions/Capability/oneOf/3/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if("compatible" !== data6){
const err20 = {instancePath:instancePath+"/capability/kind",schemaPath:"#/definitions/Capability/oneOf/3/properties/kind/const",keyword:"const",params:{allowedValue: "compatible"},message:"must be equal to constant"};
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
if(valid6){
if(data0.version !== undefined){
const _errs29 = errors;
if(typeof data0.version !== "string"){
const err21 = {instancePath:instancePath+"/capability/version",schemaPath:"#/definitions/Capability/oneOf/3/properties/version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
var valid6 = _errs29 === errors;
}
else {
var valid6 = true;
}
}
}
}
}
else {
const err22 = {instancePath:instancePath+"/capability",schemaPath:"#/definitions/Capability/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
var _valid0 = _errs24 === errors;
if(_valid0 && valid2){
valid2 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid2 = true;
passing0 = 3;
}
}
}
}
if(!valid2){
const err23 = {instancePath:instancePath+"/capability",schemaPath:"#/definitions/Capability/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
validate91.errors = vErrors;
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
if(data.error !== undefined){
let data8 = data.error;
const _errs31 = errors;
if((typeof data8 !== "string") && (data8 !== null)){
validate91.errors = [{instancePath:instancePath+"/error",schemaPath:"#/properties/error/type",keyword:"type",params:{type: schema149.properties.error.type},message:"must be string,null"}];
return false;
}
var valid0 = _errs31 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.generation !== undefined){
const _errs33 = errors;
if(typeof data.generation !== "string"){
validate91.errors = [{instancePath:instancePath+"/generation",schemaPath:"#/properties/generation/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs33 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.microphonePeak !== undefined){
let data10 = data.microphonePeak;
const _errs35 = errors;
if(!(((typeof data10 == "number") && (!(data10 % 1) && !isNaN(data10))) && (isFinite(data10)))){
validate91.errors = [{instancePath:instancePath+"/microphonePeak",schemaPath:"#/properties/microphonePeak/type",keyword:"type",params:{type: "integer"},message:"must be integer"}];
return false;
}
if(errors === _errs35){
if((typeof data10 == "number") && (isFinite(data10))){
if(data10 > 65535 || isNaN(data10)){
validate91.errors = [{instancePath:instancePath+"/microphonePeak",schemaPath:"#/properties/microphonePeak/maximum",keyword:"maximum",params:{comparison: "<=", limit: 65535},message:"must be <= 65535"}];
return false;
}
else {
if(data10 < 0 || isNaN(data10)){
validate91.errors = [{instancePath:instancePath+"/microphonePeak",schemaPath:"#/properties/microphonePeak/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"}];
return false;
}
}
}
}
var valid0 = _errs35 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.phase !== undefined){
let data11 = data.phase;
const _errs37 = errors;
if(typeof data11 !== "string"){
validate91.errors = [{instancePath:instancePath+"/phase",schemaPath:"#/definitions/Phase/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!(((((((data11 === "off") || (data11 === "preparing")) || (data11 === "negotiating")) || (data11 === "active")) || (data11 === "stopping")) || (data11 === "failed")) || (data11 === "unconfirmed"))){
validate91.errors = [{instancePath:instancePath+"/phase",schemaPath:"#/definitions/Phase/enum",keyword:"enum",params:{allowedValues: schema151.enum},message:"must be equal to one of the allowed values"}];
return false;
}
var valid0 = _errs37 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.realtimeSession !== undefined){
let data12 = data.realtimeSession;
const _errs40 = errors;
if((typeof data12 !== "string") && (data12 !== null)){
validate91.errors = [{instancePath:instancePath+"/realtimeSession",schemaPath:"#/properties/realtimeSession/type",keyword:"type",params:{type: schema149.properties.realtimeSession.type},message:"must be string,null"}];
return false;
}
var valid0 = _errs40 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.speakerPeak !== undefined){
let data13 = data.speakerPeak;
const _errs42 = errors;
if(!(((typeof data13 == "number") && (!(data13 % 1) && !isNaN(data13))) && (isFinite(data13)))){
validate91.errors = [{instancePath:instancePath+"/speakerPeak",schemaPath:"#/properties/speakerPeak/type",keyword:"type",params:{type: "integer"},message:"must be integer"}];
return false;
}
if(errors === _errs42){
if((typeof data13 == "number") && (isFinite(data13))){
if(data13 > 65535 || isNaN(data13)){
validate91.errors = [{instancePath:instancePath+"/speakerPeak",schemaPath:"#/properties/speakerPeak/maximum",keyword:"maximum",params:{comparison: "<=", limit: 65535},message:"must be <= 65535"}];
return false;
}
else {
if(data13 < 0 || isNaN(data13)){
validate91.errors = [{instancePath:instancePath+"/speakerPeak",schemaPath:"#/properties/speakerPeak/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"}];
return false;
}
}
}
}
var valid0 = _errs42 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.thread !== undefined){
let data14 = data.thread;
const _errs44 = errors;
if((typeof data14 !== "string") && (data14 !== null)){
validate91.errors = [{instancePath:instancePath+"/thread",schemaPath:"#/properties/thread/type",keyword:"type",params:{type: schema149.properties.thread.type},message:"must be string,null"}];
return false;
}
var valid0 = _errs44 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.turn !== undefined){
let data15 = data.turn;
const _errs46 = errors;
if((typeof data15 !== "string") && (data15 !== null)){
validate91.errors = [{instancePath:instancePath+"/turn",schemaPath:"#/properties/turn/type",keyword:"type",params:{type: schema149.properties.turn.type},message:"must be string,null"}];
return false;
}
var valid0 = _errs46 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.version !== undefined){
const _errs48 = errors;
if(typeof data.version !== "string"){
validate91.errors = [{instancePath:instancePath+"/version",schemaPath:"#/properties/version/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
var valid0 = _errs48 === errors;
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
}
else {
validate91.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate91.errors = vErrors;
return errors === 0;
}

export const workspaceTool = validate92;
const schema152 = {"$schema":"http://json-schema.org/draft-07/schema#","additionalProperties":false,"definitions":{"Action":{"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"inspect","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"home","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"canvas":{"$ref":"#/definitions/Canvas"},"operation":{"const":"update-canvas","type":"string"}},"required":["operation","canvas"],"type":"object"},{"additionalProperties":false,"properties":{"collapsed":{"type":"boolean"},"operation":{"const":"set-sidebar","type":"string"}},"required":["operation","collapsed"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"name":{"type":"string"},"operation":{"const":"save-layout","type":"string"}},"required":["operation","fleet","name"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"name":{"type":"string"},"operation":{"const":"load-layout","type":"string"}},"required":["operation","fleet","name"],"type":"object"},{"additionalProperties":false,"properties":{"cwd":{"type":"string"},"name":{"type":"string"},"operation":{"const":"create-voyage","type":"string"}},"required":["operation","name","cwd"],"type":"object"},{"additionalProperties":false,"properties":{"name":{"type":"string"},"operation":{"const":"create-fleet","type":"string"},"voyage":{"type":"string"}},"required":["operation","voyage","name"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"create-portal","type":"string"},"voyage":{"type":"string"}},"required":["operation","voyage"],"type":"object"},{"additionalProperties":false,"properties":{"destination":{"$ref":"#/definitions/ContentDestination"},"launch":{"anyOf":[{"$ref":"#/definitions/Launch"},{"type":"null"}]},"operation":{"const":"create-content","type":"string"},"typeId":{"type":"string"}},"required":["operation","typeId","destination"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"remove-content-package","type":"string"},"typeId":{"type":"string"}},"required":["operation","typeId"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"restore-content-package","type":"string"},"typeId":{"type":"string"}},"required":["operation","typeId"],"type":"object"},{"additionalProperties":false,"properties":{"name":{"type":"string"},"operation":{"const":"rename","type":"string"},"target":{"$ref":"#/definitions/RenameTarget"}},"required":["operation","target","name"],"type":"object"},{"additionalProperties":false,"properties":{"after":{"type":"string"},"axis":{"$ref":"#/definitions/Axis"},"fleet":{"type":"string"},"operation":{"const":"split","type":"string"}},"required":["operation","fleet","after","axis"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"operation":{"const":"resize-split","type":"string"},"path":{"items":{"$ref":"#/definitions/SplitChild"},"maxItems":128,"type":"array"},"share":{"$ref":"#/definitions/SplitShare"}},"required":["operation","fleet","path","share"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"move-vessel","type":"string"},"side":{"$ref":"#/definitions/Side"},"target":{"type":"string"}},"required":["operation","id","target","side"],"type":"object"},{"additionalProperties":false,"properties":{"before":{"type":"boolean"},"id":{"type":"string"},"operation":{"const":"move-voyage","type":"string"},"target":{"type":"string"}},"required":["operation","id","target","before"],"type":"object"},{"additionalProperties":false,"properties":{"before":{"type":"boolean"},"id":{"type":"string"},"operation":{"const":"move-fleet","type":"string"},"target":{"type":"string"}},"required":["operation","id","target","before"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"select-voyage","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"select-fleet","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"reveal-vessel","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"context":{"$ref":"#/definitions/Context"},"operation":{"const":"dock","type":"string"}},"required":["operation","context"],"type":"object"}]},"Axis":{"enum":["horizontal","vertical"],"type":"string"},"Canvas":{"additionalProperties":false,"properties":{"portalMode":{"allOf":[{"$ref":"#/definitions/PortalMode"}],"default":"overlay"},"root":{"$ref":"#/definitions/Node"},"sidebarCollapsed":{"default":false,"type":"boolean"}},"required":["root"],"type":"object"},"ContentDestination":{"oneOf":[{"additionalProperties":false,"properties":{"after":{"type":"string"},"axis":{"$ref":"#/definitions/Axis"},"fleet":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","fleet","after","axis"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"portal","type":"string"},"voyage":{"type":"string"}},"required":["kind","voyage"],"type":"object"}]},"Context":{"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"workspace","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]},"Effort":{"enum":["low","medium","high","xhigh","max","ultra"],"type":"string"},"Launch":{"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"terminal","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"effort":{"allOf":[{"$ref":"#/definitions/Effort"}],"default":"high"},"kind":{"const":"codex","type":"string"},"model":{"default":"gpt-6.1-sol","type":"string"},"permissions":{"allOf":[{"$ref":"#/definitions/Permissions"}],"default":"yolo"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"argv":{"items":{"type":"string"},"type":"array"},"kind":{"const":"program","type":"string"}},"required":["kind","argv"],"type":"object"}]},"Node":{"oneOf":[{"additionalProperties":false,"properties":{"children":{"items":{"$ref":"#/definitions/Node"},"type":"array"},"kind":{"const":"row","type":"string"},"size":{"allOf":[{"$ref":"#/definitions/Size"}],"default":{"kind":"fill"}}},"required":["kind","children"],"type":"object"},{"additionalProperties":false,"properties":{"children":{"items":{"$ref":"#/definitions/Node"},"type":"array"},"kind":{"const":"column","type":"string"},"size":{"allOf":[{"$ref":"#/definitions/Size"}],"default":{"kind":"fill"}}},"required":["kind","children"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"block","type":"string"},"region":{"$ref":"#/definitions/Region"},"size":{"allOf":[{"$ref":"#/definitions/Size"}],"default":{"kind":"fill"}}},"required":["kind","region"],"type":"object"}]},"Permissions":{"enum":["yolo","workspace-write","read-only"],"type":"string"},"PortalMode":{"enum":["overlay","make-room"],"type":"string"},"Region":{"enum":["sidebar","fleet-strip","active-fleet","portals","context-bar"],"type":"string"},"RenameTarget":{"oneOf":[{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]},"Side":{"enum":["left","right","top","bottom"],"type":"string"},"Size":{"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"fill","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"content","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"fixed","type":"string"},"pixels":{"maximum":4096,"minimum":1,"type":"integer"}},"required":["kind","pixels"],"type":"object"}]},"SplitChild":{"enum":["first","second"],"type":"string"},"SplitShare":{"maximum":9999,"minimum":1,"type":"integer"}},"properties":{"action":{"$ref":"#/definitions/Action"},"expectedVersion":{"type":"string"}},"required":["expectedVersion","action"],"title":"WorkspaceInput","type":"object"};
const schema153 = {"oneOf":[{"additionalProperties":false,"properties":{"operation":{"const":"inspect","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"home","type":"string"}},"required":["operation"],"type":"object"},{"additionalProperties":false,"properties":{"canvas":{"$ref":"#/definitions/Canvas"},"operation":{"const":"update-canvas","type":"string"}},"required":["operation","canvas"],"type":"object"},{"additionalProperties":false,"properties":{"collapsed":{"type":"boolean"},"operation":{"const":"set-sidebar","type":"string"}},"required":["operation","collapsed"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"name":{"type":"string"},"operation":{"const":"save-layout","type":"string"}},"required":["operation","fleet","name"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"name":{"type":"string"},"operation":{"const":"load-layout","type":"string"}},"required":["operation","fleet","name"],"type":"object"},{"additionalProperties":false,"properties":{"cwd":{"type":"string"},"name":{"type":"string"},"operation":{"const":"create-voyage","type":"string"}},"required":["operation","name","cwd"],"type":"object"},{"additionalProperties":false,"properties":{"name":{"type":"string"},"operation":{"const":"create-fleet","type":"string"},"voyage":{"type":"string"}},"required":["operation","voyage","name"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"create-portal","type":"string"},"voyage":{"type":"string"}},"required":["operation","voyage"],"type":"object"},{"additionalProperties":false,"properties":{"destination":{"$ref":"#/definitions/ContentDestination"},"launch":{"anyOf":[{"$ref":"#/definitions/Launch"},{"type":"null"}]},"operation":{"const":"create-content","type":"string"},"typeId":{"type":"string"}},"required":["operation","typeId","destination"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"remove-content-package","type":"string"},"typeId":{"type":"string"}},"required":["operation","typeId"],"type":"object"},{"additionalProperties":false,"properties":{"operation":{"const":"restore-content-package","type":"string"},"typeId":{"type":"string"}},"required":["operation","typeId"],"type":"object"},{"additionalProperties":false,"properties":{"name":{"type":"string"},"operation":{"const":"rename","type":"string"},"target":{"$ref":"#/definitions/RenameTarget"}},"required":["operation","target","name"],"type":"object"},{"additionalProperties":false,"properties":{"after":{"type":"string"},"axis":{"$ref":"#/definitions/Axis"},"fleet":{"type":"string"},"operation":{"const":"split","type":"string"}},"required":["operation","fleet","after","axis"],"type":"object"},{"additionalProperties":false,"properties":{"fleet":{"type":"string"},"operation":{"const":"resize-split","type":"string"},"path":{"items":{"$ref":"#/definitions/SplitChild"},"maxItems":128,"type":"array"},"share":{"$ref":"#/definitions/SplitShare"}},"required":["operation","fleet","path","share"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"move-vessel","type":"string"},"side":{"$ref":"#/definitions/Side"},"target":{"type":"string"}},"required":["operation","id","target","side"],"type":"object"},{"additionalProperties":false,"properties":{"before":{"type":"boolean"},"id":{"type":"string"},"operation":{"const":"move-voyage","type":"string"},"target":{"type":"string"}},"required":["operation","id","target","before"],"type":"object"},{"additionalProperties":false,"properties":{"before":{"type":"boolean"},"id":{"type":"string"},"operation":{"const":"move-fleet","type":"string"},"target":{"type":"string"}},"required":["operation","id","target","before"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"select-voyage","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"select-fleet","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"operation":{"const":"reveal-vessel","type":"string"}},"required":["operation","id"],"type":"object"},{"additionalProperties":false,"properties":{"context":{"$ref":"#/definitions/Context"},"operation":{"const":"dock","type":"string"}},"required":["operation","context"],"type":"object"}]};
const schema166 = {"oneOf":[{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]};
const schema162 = {"enum":["horizontal","vertical"],"type":"string"};
const schema168 = {"enum":["first","second"],"type":"string"};
const schema169 = {"maximum":9999,"minimum":1,"type":"integer"};
const schema170 = {"enum":["left","right","top","bottom"],"type":"string"};
const schema171 = {"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"workspace","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"voyage","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"fleet","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","id"],"type":"object"},{"additionalProperties":false,"properties":{"id":{"type":"string"},"kind":{"const":"portal","type":"string"}},"required":["kind","id"],"type":"object"}]};
const schema154 = {"additionalProperties":false,"properties":{"portalMode":{"allOf":[{"$ref":"#/definitions/PortalMode"}],"default":"overlay"},"root":{"$ref":"#/definitions/Node"},"sidebarCollapsed":{"default":false,"type":"boolean"}},"required":["root"],"type":"object"};
const schema155 = {"enum":["overlay","make-room"],"type":"string"};
const schema156 = {"oneOf":[{"additionalProperties":false,"properties":{"children":{"items":{"$ref":"#/definitions/Node"},"type":"array"},"kind":{"const":"row","type":"string"},"size":{"allOf":[{"$ref":"#/definitions/Size"}],"default":{"kind":"fill"}}},"required":["kind","children"],"type":"object"},{"additionalProperties":false,"properties":{"children":{"items":{"$ref":"#/definitions/Node"},"type":"array"},"kind":{"const":"column","type":"string"},"size":{"allOf":[{"$ref":"#/definitions/Size"}],"default":{"kind":"fill"}}},"required":["kind","children"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"block","type":"string"},"region":{"$ref":"#/definitions/Region"},"size":{"allOf":[{"$ref":"#/definitions/Size"}],"default":{"kind":"fill"}}},"required":["kind","region"],"type":"object"}]};
const schema157 = {"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"fill","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"content","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"fixed","type":"string"},"pixels":{"maximum":4096,"minimum":1,"type":"integer"}},"required":["kind","pixels"],"type":"object"}]};
const schema159 = {"enum":["sidebar","fleet-strip","active-fleet","portals","context-bar"],"type":"string"};
const wrapper10 = {validate: validate95};

function validate95(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(errors === _errs1){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((data.kind === undefined) && (missing0 = "kind")) || ((data.children === undefined) && (missing0 = "children"))){
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
if(!(((key0 === "children") || (key0 === "kind")) || (key0 === "size"))){
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
if(data.children !== undefined){
let data0 = data.children;
const _errs4 = errors;
if(errors === _errs4){
if(Array.isArray(data0)){
var valid2 = true;
const len0 = data0.length;
for(let i0=0; i0<len0; i0++){
const _errs6 = errors;
if(!(wrapper10.validate(data0[i0], {instancePath:instancePath+"/children/" + i0,parentData:data0,parentDataProperty:i0,rootData}))){
vErrors = vErrors === null ? wrapper10.validate.errors : vErrors.concat(wrapper10.validate.errors);
errors = vErrors.length;
}
var valid2 = _errs6 === errors;
if(!valid2){
break;
}
}
}
else {
const err2 = {instancePath:instancePath+"/children",schemaPath:"#/oneOf/0/properties/children/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
var valid1 = _errs4 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.kind !== undefined){
let data2 = data.kind;
const _errs7 = errors;
if(typeof data2 !== "string"){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if("row" !== data2){
const err4 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "row"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
var valid1 = _errs7 === errors;
}
else {
var valid1 = true;
}
if(valid1){
if(data.size !== undefined){
let data3 = data.size;
const _errs9 = errors;
const _errs12 = errors;
let valid5 = false;
let passing1 = null;
const _errs13 = errors;
if(errors === _errs13){
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
let missing1;
if((data3.kind === undefined) && (missing1 = "kind")){
const err5 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
else {
const _errs15 = errors;
for(const key1 in data3){
if(!(key1 === "kind")){
const err6 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
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
if(_errs15 === errors){
if(data3.kind !== undefined){
let data4 = data3.kind;
if(typeof data4 !== "string"){
const err7 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if("fill" !== data4){
const err8 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "fill"},message:"must be equal to constant"};
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
const err9 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
var _valid1 = _errs13 === errors;
if(_valid1){
valid5 = true;
passing1 = 0;
}
const _errs18 = errors;
if(errors === _errs18){
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
let missing2;
if((data3.kind === undefined) && (missing2 = "kind")){
const err10 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
else {
const _errs20 = errors;
for(const key2 in data3){
if(!(key2 === "kind")){
const err11 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
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
if(_errs20 === errors){
if(data3.kind !== undefined){
let data5 = data3.kind;
if(typeof data5 !== "string"){
const err12 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if("content" !== data5){
const err13 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "content"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
}
}
else {
const err14 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
var _valid1 = _errs18 === errors;
if(_valid1 && valid5){
valid5 = false;
passing1 = [passing1, 1];
}
else {
if(_valid1){
valid5 = true;
passing1 = 1;
}
const _errs23 = errors;
if(errors === _errs23){
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
let missing3;
if(((data3.kind === undefined) && (missing3 = "kind")) || ((data3.pixels === undefined) && (missing3 = "pixels"))){
const err15 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/required",keyword:"required",params:{missingProperty: missing3},message:"must have required property '"+missing3+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
else {
const _errs25 = errors;
for(const key3 in data3){
if(!((key3 === "kind") || (key3 === "pixels"))){
const err16 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
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
if(_errs25 === errors){
if(data3.kind !== undefined){
let data6 = data3.kind;
const _errs26 = errors;
if(typeof data6 !== "string"){
const err17 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if("fixed" !== data6){
const err18 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "fixed"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
var valid8 = _errs26 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data3.pixels !== undefined){
let data7 = data3.pixels;
const _errs28 = errors;
if(!(((typeof data7 == "number") && (!(data7 % 1) && !isNaN(data7))) && (isFinite(data7)))){
const err19 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(errors === _errs28){
if((typeof data7 == "number") && (isFinite(data7))){
if(data7 > 4096 || isNaN(data7)){
const err20 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/maximum",keyword:"maximum",params:{comparison: "<=", limit: 4096},message:"must be <= 4096"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
else {
if(data7 < 1 || isNaN(data7)){
const err21 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
}
}
var valid8 = _errs28 === errors;
}
else {
var valid8 = true;
}
}
}
}
}
else {
const err22 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
var _valid1 = _errs23 === errors;
if(_valid1 && valid5){
valid5 = false;
passing1 = [passing1, 2];
}
else {
if(_valid1){
valid5 = true;
passing1 = 2;
}
}
}
if(!valid5){
const err23 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf",keyword:"oneOf",params:{passingSchemas: passing1},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
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
var valid1 = _errs9 === errors;
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
const err24 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
}
const _errs30 = errors;
if(errors === _errs30){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing4;
if(((data.kind === undefined) && (missing4 = "kind")) || ((data.children === undefined) && (missing4 = "children"))){
const err25 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: missing4},message:"must have required property '"+missing4+"'"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
else {
const _errs32 = errors;
for(const key4 in data){
if(!(((key4 === "children") || (key4 === "kind")) || (key4 === "size"))){
const err26 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
break;
}
}
if(_errs32 === errors){
if(data.children !== undefined){
let data8 = data.children;
const _errs33 = errors;
if(errors === _errs33){
if(Array.isArray(data8)){
var valid10 = true;
const len1 = data8.length;
for(let i1=0; i1<len1; i1++){
const _errs35 = errors;
if(!(wrapper10.validate(data8[i1], {instancePath:instancePath+"/children/" + i1,parentData:data8,parentDataProperty:i1,rootData}))){
vErrors = vErrors === null ? wrapper10.validate.errors : vErrors.concat(wrapper10.validate.errors);
errors = vErrors.length;
}
var valid10 = _errs35 === errors;
if(!valid10){
break;
}
}
}
else {
const err27 = {instancePath:instancePath+"/children",schemaPath:"#/oneOf/1/properties/children/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
var valid9 = _errs33 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data.kind !== undefined){
let data10 = data.kind;
const _errs36 = errors;
if(typeof data10 !== "string"){
const err28 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if("column" !== data10){
const err29 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "column"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
var valid9 = _errs36 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data.size !== undefined){
let data11 = data.size;
const _errs38 = errors;
const _errs41 = errors;
let valid13 = false;
let passing2 = null;
const _errs42 = errors;
if(errors === _errs42){
if(data11 && typeof data11 == "object" && !Array.isArray(data11)){
let missing5;
if((data11.kind === undefined) && (missing5 = "kind")){
const err30 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/required",keyword:"required",params:{missingProperty: missing5},message:"must have required property '"+missing5+"'"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
else {
const _errs44 = errors;
for(const key5 in data11){
if(!(key5 === "kind")){
const err31 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
break;
}
}
if(_errs44 === errors){
if(data11.kind !== undefined){
let data12 = data11.kind;
if(typeof data12 !== "string"){
const err32 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
if("fill" !== data12){
const err33 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "fill"},message:"must be equal to constant"};
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
}
else {
const err34 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
var _valid2 = _errs42 === errors;
if(_valid2){
valid13 = true;
passing2 = 0;
}
const _errs47 = errors;
if(errors === _errs47){
if(data11 && typeof data11 == "object" && !Array.isArray(data11)){
let missing6;
if((data11.kind === undefined) && (missing6 = "kind")){
const err35 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/required",keyword:"required",params:{missingProperty: missing6},message:"must have required property '"+missing6+"'"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
else {
const _errs49 = errors;
for(const key6 in data11){
if(!(key6 === "kind")){
const err36 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
break;
}
}
if(_errs49 === errors){
if(data11.kind !== undefined){
let data13 = data11.kind;
if(typeof data13 !== "string"){
const err37 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
if("content" !== data13){
const err38 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "content"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
}
}
}
else {
const err39 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
var _valid2 = _errs47 === errors;
if(_valid2 && valid13){
valid13 = false;
passing2 = [passing2, 1];
}
else {
if(_valid2){
valid13 = true;
passing2 = 1;
}
const _errs52 = errors;
if(errors === _errs52){
if(data11 && typeof data11 == "object" && !Array.isArray(data11)){
let missing7;
if(((data11.kind === undefined) && (missing7 = "kind")) || ((data11.pixels === undefined) && (missing7 = "pixels"))){
const err40 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/required",keyword:"required",params:{missingProperty: missing7},message:"must have required property '"+missing7+"'"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
else {
const _errs54 = errors;
for(const key7 in data11){
if(!((key7 === "kind") || (key7 === "pixels"))){
const err41 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key7},message:"must NOT have additional properties"};
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
if(_errs54 === errors){
if(data11.kind !== undefined){
let data14 = data11.kind;
const _errs55 = errors;
if(typeof data14 !== "string"){
const err42 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
if("fixed" !== data14){
const err43 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "fixed"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
var valid16 = _errs55 === errors;
}
else {
var valid16 = true;
}
if(valid16){
if(data11.pixels !== undefined){
let data15 = data11.pixels;
const _errs57 = errors;
if(!(((typeof data15 == "number") && (!(data15 % 1) && !isNaN(data15))) && (isFinite(data15)))){
const err44 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
if(errors === _errs57){
if((typeof data15 == "number") && (isFinite(data15))){
if(data15 > 4096 || isNaN(data15)){
const err45 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/maximum",keyword:"maximum",params:{comparison: "<=", limit: 4096},message:"must be <= 4096"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
else {
if(data15 < 1 || isNaN(data15)){
const err46 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
}
}
var valid16 = _errs57 === errors;
}
else {
var valid16 = true;
}
}
}
}
}
else {
const err47 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
}
var _valid2 = _errs52 === errors;
if(_valid2 && valid13){
valid13 = false;
passing2 = [passing2, 2];
}
else {
if(_valid2){
valid13 = true;
passing2 = 2;
}
}
}
if(!valid13){
const err48 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf",keyword:"oneOf",params:{passingSchemas: passing2},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
else {
errors = _errs41;
if(vErrors !== null){
if(_errs41){
vErrors.length = _errs41;
}
else {
vErrors = null;
}
}
}
var valid9 = _errs38 === errors;
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
const err49 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
var _valid0 = _errs30 === errors;
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
let missing8;
if(((data.kind === undefined) && (missing8 = "kind")) || ((data.region === undefined) && (missing8 = "region"))){
const err50 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: missing8},message:"must have required property '"+missing8+"'"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
else {
const _errs61 = errors;
for(const key8 in data){
if(!(((key8 === "kind") || (key8 === "region")) || (key8 === "size"))){
const err51 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key8},message:"must NOT have additional properties"};
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
if(_errs61 === errors){
if(data.kind !== undefined){
let data16 = data.kind;
const _errs62 = errors;
if(typeof data16 !== "string"){
const err52 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
if("block" !== data16){
const err53 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "block"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
var valid17 = _errs62 === errors;
}
else {
var valid17 = true;
}
if(valid17){
if(data.region !== undefined){
let data17 = data.region;
const _errs64 = errors;
if(typeof data17 !== "string"){
const err54 = {instancePath:instancePath+"/region",schemaPath:"#/definitions/Region/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
if(!(((((data17 === "sidebar") || (data17 === "fleet-strip")) || (data17 === "active-fleet")) || (data17 === "portals")) || (data17 === "context-bar"))){
const err55 = {instancePath:instancePath+"/region",schemaPath:"#/definitions/Region/enum",keyword:"enum",params:{allowedValues: schema159.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
var valid17 = _errs64 === errors;
}
else {
var valid17 = true;
}
if(valid17){
if(data.size !== undefined){
let data18 = data.size;
const _errs67 = errors;
const _errs70 = errors;
let valid21 = false;
let passing3 = null;
const _errs71 = errors;
if(errors === _errs71){
if(data18 && typeof data18 == "object" && !Array.isArray(data18)){
let missing9;
if((data18.kind === undefined) && (missing9 = "kind")){
const err56 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/required",keyword:"required",params:{missingProperty: missing9},message:"must have required property '"+missing9+"'"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
else {
const _errs73 = errors;
for(const key9 in data18){
if(!(key9 === "kind")){
const err57 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key9},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
break;
}
}
if(_errs73 === errors){
if(data18.kind !== undefined){
let data19 = data18.kind;
if(typeof data19 !== "string"){
const err58 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
if("fill" !== data19){
const err59 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "fill"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
}
}
}
}
else {
const err60 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
var _valid3 = _errs71 === errors;
if(_valid3){
valid21 = true;
passing3 = 0;
}
const _errs76 = errors;
if(errors === _errs76){
if(data18 && typeof data18 == "object" && !Array.isArray(data18)){
let missing10;
if((data18.kind === undefined) && (missing10 = "kind")){
const err61 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/required",keyword:"required",params:{missingProperty: missing10},message:"must have required property '"+missing10+"'"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
else {
const _errs78 = errors;
for(const key10 in data18){
if(!(key10 === "kind")){
const err62 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key10},message:"must NOT have additional properties"};
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
if(_errs78 === errors){
if(data18.kind !== undefined){
let data20 = data18.kind;
if(typeof data20 !== "string"){
const err63 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
if("content" !== data20){
const err64 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "content"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
}
}
}
}
else {
const err65 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
}
var _valid3 = _errs76 === errors;
if(_valid3 && valid21){
valid21 = false;
passing3 = [passing3, 1];
}
else {
if(_valid3){
valid21 = true;
passing3 = 1;
}
const _errs81 = errors;
if(errors === _errs81){
if(data18 && typeof data18 == "object" && !Array.isArray(data18)){
let missing11;
if(((data18.kind === undefined) && (missing11 = "kind")) || ((data18.pixels === undefined) && (missing11 = "pixels"))){
const err66 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/required",keyword:"required",params:{missingProperty: missing11},message:"must have required property '"+missing11+"'"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
else {
const _errs83 = errors;
for(const key11 in data18){
if(!((key11 === "kind") || (key11 === "pixels"))){
const err67 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key11},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
break;
}
}
if(_errs83 === errors){
if(data18.kind !== undefined){
let data21 = data18.kind;
const _errs84 = errors;
if(typeof data21 !== "string"){
const err68 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
if("fixed" !== data21){
const err69 = {instancePath:instancePath+"/size/kind",schemaPath:"#/definitions/Size/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "fixed"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
var valid24 = _errs84 === errors;
}
else {
var valid24 = true;
}
if(valid24){
if(data18.pixels !== undefined){
let data22 = data18.pixels;
const _errs86 = errors;
if(!(((typeof data22 == "number") && (!(data22 % 1) && !isNaN(data22))) && (isFinite(data22)))){
const err70 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
if(errors === _errs86){
if((typeof data22 == "number") && (isFinite(data22))){
if(data22 > 4096 || isNaN(data22)){
const err71 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/maximum",keyword:"maximum",params:{comparison: "<=", limit: 4096},message:"must be <= 4096"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
else {
if(data22 < 1 || isNaN(data22)){
const err72 = {instancePath:instancePath+"/size/pixels",schemaPath:"#/definitions/Size/oneOf/2/properties/pixels/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
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
var valid24 = _errs86 === errors;
}
else {
var valid24 = true;
}
}
}
}
}
else {
const err73 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
}
var _valid3 = _errs81 === errors;
if(_valid3 && valid21){
valid21 = false;
passing3 = [passing3, 2];
}
else {
if(_valid3){
valid21 = true;
passing3 = 2;
}
}
}
if(!valid21){
const err74 = {instancePath:instancePath+"/size",schemaPath:"#/definitions/Size/oneOf",keyword:"oneOf",params:{passingSchemas: passing3},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
else {
errors = _errs70;
if(vErrors !== null){
if(_errs70){
vErrors.length = _errs70;
}
else {
vErrors = null;
}
}
}
var valid17 = _errs67 === errors;
}
else {
var valid17 = true;
}
}
}
}
}
}
else {
const err75 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
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
}
}
if(!valid0){
const err76 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
validate95.errors = vErrors;
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
validate95.errors = vErrors;
return errors === 0;
}


function validate94(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((data.root === undefined) && (missing0 = "root")){
validate94.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(((key0 === "portalMode") || (key0 === "root")) || (key0 === "sidebarCollapsed"))){
validate94.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.portalMode !== undefined){
let data0 = data.portalMode;
const _errs2 = errors;
if(typeof data0 !== "string"){
validate94.errors = [{instancePath:instancePath+"/portalMode",schemaPath:"#/definitions/PortalMode/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
if(!((data0 === "overlay") || (data0 === "make-room"))){
validate94.errors = [{instancePath:instancePath+"/portalMode",schemaPath:"#/definitions/PortalMode/enum",keyword:"enum",params:{allowedValues: schema155.enum},message:"must be equal to one of the allowed values"}];
return false;
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.root !== undefined){
const _errs6 = errors;
if(!(validate95(data.root, {instancePath:instancePath+"/root",parentData:data,parentDataProperty:"root",rootData}))){
vErrors = vErrors === null ? validate95.errors : vErrors.concat(validate95.errors);
errors = vErrors.length;
}
var valid0 = _errs6 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.sidebarCollapsed !== undefined){
const _errs7 = errors;
if(typeof data.sidebarCollapsed !== "boolean"){
validate94.errors = [{instancePath:instancePath+"/sidebarCollapsed",schemaPath:"#/properties/sidebarCollapsed/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"}];
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
validate94.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate94.errors = vErrors;
return errors === 0;
}

const schema161 = {"oneOf":[{"additionalProperties":false,"properties":{"after":{"type":"string"},"axis":{"$ref":"#/definitions/Axis"},"fleet":{"type":"string"},"kind":{"const":"vessel","type":"string"}},"required":["kind","fleet","after","axis"],"type":"object"},{"additionalProperties":false,"properties":{"kind":{"const":"portal","type":"string"},"voyage":{"type":"string"}},"required":["kind","voyage"],"type":"object"}]};

function validate98(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
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
const err4 = {instancePath:instancePath+"/axis",schemaPath:"#/definitions/Axis/enum",keyword:"enum",params:{allowedValues: schema162.enum},message:"must be equal to one of the allowed values"};
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
validate98.errors = vErrors;
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
validate98.errors = vErrors;
return errors === 0;
}

const schema163 = {"oneOf":[{"additionalProperties":false,"properties":{"kind":{"const":"terminal","type":"string"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"effort":{"allOf":[{"$ref":"#/definitions/Effort"}],"default":"high"},"kind":{"const":"codex","type":"string"},"model":{"default":"gpt-6.1-sol","type":"string"},"permissions":{"allOf":[{"$ref":"#/definitions/Permissions"}],"default":"yolo"}},"required":["kind"],"type":"object"},{"additionalProperties":false,"properties":{"argv":{"items":{"type":"string"},"type":"array"},"kind":{"const":"program","type":"string"}},"required":["kind","argv"],"type":"object"}]};
const schema164 = {"enum":["low","medium","high","xhigh","max","ultra"],"type":"string"};
const schema165 = {"enum":["yolo","workspace-write","read-only"],"type":"string"};

function validate100(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(errors === _errs1){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((data.kind === undefined) && (missing0 = "kind")){
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
if(!(key0 === "kind")){
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
if("terminal" !== data0){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "terminal"},message:"must be equal to constant"};
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
if((data.kind === undefined) && (missing1 = "kind")){
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
if(!((((key1 === "effort") || (key1 === "kind")) || (key1 === "model")) || (key1 === "permissions"))){
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
if(data.effort !== undefined){
let data1 = data.effort;
const _errs9 = errors;
if(typeof data1 !== "string"){
const err7 = {instancePath:instancePath+"/effort",schemaPath:"#/definitions/Effort/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(!((((((data1 === "low") || (data1 === "medium")) || (data1 === "high")) || (data1 === "xhigh")) || (data1 === "max")) || (data1 === "ultra"))){
const err8 = {instancePath:instancePath+"/effort",schemaPath:"#/definitions/Effort/enum",keyword:"enum",params:{allowedValues: schema164.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
var valid2 = _errs9 === errors;
}
else {
var valid2 = true;
}
if(valid2){
if(data.kind !== undefined){
let data2 = data.kind;
const _errs13 = errors;
if(typeof data2 !== "string"){
const err9 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if("codex" !== data2){
const err10 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "codex"},message:"must be equal to constant"};
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
if(valid2){
if(data.model !== undefined){
const _errs15 = errors;
if(typeof data.model !== "string"){
const err11 = {instancePath:instancePath+"/model",schemaPath:"#/oneOf/1/properties/model/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
if(data.permissions !== undefined){
let data4 = data.permissions;
const _errs17 = errors;
if(typeof data4 !== "string"){
const err12 = {instancePath:instancePath+"/permissions",schemaPath:"#/definitions/Permissions/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(!(((data4 === "yolo") || (data4 === "workspace-write")) || (data4 === "read-only"))){
const err13 = {instancePath:instancePath+"/permissions",schemaPath:"#/definitions/Permissions/enum",keyword:"enum",params:{allowedValues: schema165.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
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
const _errs21 = errors;
if(errors === _errs21){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing2;
if(((data.kind === undefined) && (missing2 = "kind")) || ((data.argv === undefined) && (missing2 = "argv"))){
const err15 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"};
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
for(const key2 in data){
if(!((key2 === "argv") || (key2 === "kind"))){
const err16 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
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
if(data.argv !== undefined){
let data5 = data.argv;
const _errs24 = errors;
if(errors === _errs24){
if(Array.isArray(data5)){
var valid8 = true;
const len0 = data5.length;
for(let i0=0; i0<len0; i0++){
const _errs26 = errors;
if(typeof data5[i0] !== "string"){
const err17 = {instancePath:instancePath+"/argv/" + i0,schemaPath:"#/oneOf/2/properties/argv/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
var valid8 = _errs26 === errors;
if(!valid8){
break;
}
}
}
else {
const err18 = {instancePath:instancePath+"/argv",schemaPath:"#/oneOf/2/properties/argv/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
var valid7 = _errs24 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data.kind !== undefined){
let data7 = data.kind;
const _errs28 = errors;
if(typeof data7 !== "string"){
const err19 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if("program" !== data7){
const err20 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "program"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
var valid7 = _errs28 === errors;
}
else {
var valid7 = true;
}
}
}
}
}
else {
const err21 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
var _valid0 = _errs21 === errors;
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
const err22 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
validate100.errors = vErrors;
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
validate100.errors = vErrors;
return errors === 0;
}


function validate93(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
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
if(((data.operation === undefined) && (missing2 = "operation")) || ((data.canvas === undefined) && (missing2 = "canvas"))){
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
if(!((key2 === "canvas") || (key2 === "operation"))){
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
if(data.canvas !== undefined){
const _errs14 = errors;
if(!(validate94(data.canvas, {instancePath:instancePath+"/canvas",parentData:data,parentDataProperty:"canvas",rootData}))){
vErrors = vErrors === null ? validate94.errors : vErrors.concat(validate94.errors);
errors = vErrors.length;
}
var valid3 = _errs14 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data.operation !== undefined){
let data3 = data.operation;
const _errs15 = errors;
if(typeof data3 !== "string"){
const err12 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/2/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if("update-canvas" !== data3){
const err13 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/2/properties/operation/const",keyword:"const",params:{allowedValue: "update-canvas"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
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
const err14 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
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
const _errs17 = errors;
if(errors === _errs17){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing3;
if(((data.operation === undefined) && (missing3 = "operation")) || ((data.collapsed === undefined) && (missing3 = "collapsed"))){
const err15 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: missing3},message:"must have required property '"+missing3+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
else {
const _errs19 = errors;
for(const key3 in data){
if(!((key3 === "collapsed") || (key3 === "operation"))){
const err16 = {instancePath,schemaPath:"#/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
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
if(_errs19 === errors){
if(data.collapsed !== undefined){
const _errs20 = errors;
if(typeof data.collapsed !== "boolean"){
const err17 = {instancePath:instancePath+"/collapsed",schemaPath:"#/oneOf/3/properties/collapsed/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
var valid4 = _errs20 === errors;
}
else {
var valid4 = true;
}
if(valid4){
if(data.operation !== undefined){
let data5 = data.operation;
const _errs22 = errors;
if(typeof data5 !== "string"){
const err18 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/3/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if("set-sidebar" !== data5){
const err19 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/3/properties/operation/const",keyword:"const",params:{allowedValue: "set-sidebar"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
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
else {
const err20 = {instancePath,schemaPath:"#/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
var _valid0 = _errs17 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid0 = true;
passing0 = 3;
}
const _errs24 = errors;
if(errors === _errs24){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing4;
if((((data.operation === undefined) && (missing4 = "operation")) || ((data.fleet === undefined) && (missing4 = "fleet"))) || ((data.name === undefined) && (missing4 = "name"))){
const err21 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: missing4},message:"must have required property '"+missing4+"'"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
else {
const _errs26 = errors;
for(const key4 in data){
if(!(((key4 === "fleet") || (key4 === "name")) || (key4 === "operation"))){
const err22 = {instancePath,schemaPath:"#/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
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
if(_errs26 === errors){
if(data.fleet !== undefined){
const _errs27 = errors;
if(typeof data.fleet !== "string"){
const err23 = {instancePath:instancePath+"/fleet",schemaPath:"#/oneOf/4/properties/fleet/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
var valid5 = _errs27 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data.name !== undefined){
const _errs29 = errors;
if(typeof data.name !== "string"){
const err24 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/4/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
var valid5 = _errs29 === errors;
}
else {
var valid5 = true;
}
if(valid5){
if(data.operation !== undefined){
let data8 = data.operation;
const _errs31 = errors;
if(typeof data8 !== "string"){
const err25 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/4/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if("save-layout" !== data8){
const err26 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/4/properties/operation/const",keyword:"const",params:{allowedValue: "save-layout"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
var valid5 = _errs31 === errors;
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
const err27 = {instancePath,schemaPath:"#/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
passing0 = [passing0, 4];
}
else {
if(_valid0){
valid0 = true;
passing0 = 4;
}
const _errs33 = errors;
if(errors === _errs33){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing5;
if((((data.operation === undefined) && (missing5 = "operation")) || ((data.fleet === undefined) && (missing5 = "fleet"))) || ((data.name === undefined) && (missing5 = "name"))){
const err28 = {instancePath,schemaPath:"#/oneOf/5/required",keyword:"required",params:{missingProperty: missing5},message:"must have required property '"+missing5+"'"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
else {
const _errs35 = errors;
for(const key5 in data){
if(!(((key5 === "fleet") || (key5 === "name")) || (key5 === "operation"))){
const err29 = {instancePath,schemaPath:"#/oneOf/5/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
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
if(_errs35 === errors){
if(data.fleet !== undefined){
const _errs36 = errors;
if(typeof data.fleet !== "string"){
const err30 = {instancePath:instancePath+"/fleet",schemaPath:"#/oneOf/5/properties/fleet/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
var valid6 = _errs36 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data.name !== undefined){
const _errs38 = errors;
if(typeof data.name !== "string"){
const err31 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/5/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
var valid6 = _errs38 === errors;
}
else {
var valid6 = true;
}
if(valid6){
if(data.operation !== undefined){
let data11 = data.operation;
const _errs40 = errors;
if(typeof data11 !== "string"){
const err32 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/5/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
if("load-layout" !== data11){
const err33 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/5/properties/operation/const",keyword:"const",params:{allowedValue: "load-layout"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
var valid6 = _errs40 === errors;
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
const err34 = {instancePath,schemaPath:"#/oneOf/5/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
var _valid0 = _errs33 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 5];
}
else {
if(_valid0){
valid0 = true;
passing0 = 5;
}
const _errs42 = errors;
if(errors === _errs42){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing6;
if((((data.operation === undefined) && (missing6 = "operation")) || ((data.name === undefined) && (missing6 = "name"))) || ((data.cwd === undefined) && (missing6 = "cwd"))){
const err35 = {instancePath,schemaPath:"#/oneOf/6/required",keyword:"required",params:{missingProperty: missing6},message:"must have required property '"+missing6+"'"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
else {
const _errs44 = errors;
for(const key6 in data){
if(!(((key6 === "cwd") || (key6 === "name")) || (key6 === "operation"))){
const err36 = {instancePath,schemaPath:"#/oneOf/6/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
break;
}
}
if(_errs44 === errors){
if(data.cwd !== undefined){
const _errs45 = errors;
if(typeof data.cwd !== "string"){
const err37 = {instancePath:instancePath+"/cwd",schemaPath:"#/oneOf/6/properties/cwd/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
var valid7 = _errs45 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data.name !== undefined){
const _errs47 = errors;
if(typeof data.name !== "string"){
const err38 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/6/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
var valid7 = _errs47 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data.operation !== undefined){
let data14 = data.operation;
const _errs49 = errors;
if(typeof data14 !== "string"){
const err39 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/6/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
if("create-voyage" !== data14){
const err40 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/6/properties/operation/const",keyword:"const",params:{allowedValue: "create-voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
var valid7 = _errs49 === errors;
}
else {
var valid7 = true;
}
}
}
}
}
}
else {
const err41 = {instancePath,schemaPath:"#/oneOf/6/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
var _valid0 = _errs42 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 6];
}
else {
if(_valid0){
valid0 = true;
passing0 = 6;
}
const _errs51 = errors;
if(errors === _errs51){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing7;
if((((data.operation === undefined) && (missing7 = "operation")) || ((data.voyage === undefined) && (missing7 = "voyage"))) || ((data.name === undefined) && (missing7 = "name"))){
const err42 = {instancePath,schemaPath:"#/oneOf/7/required",keyword:"required",params:{missingProperty: missing7},message:"must have required property '"+missing7+"'"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
else {
const _errs53 = errors;
for(const key7 in data){
if(!(((key7 === "name") || (key7 === "operation")) || (key7 === "voyage"))){
const err43 = {instancePath,schemaPath:"#/oneOf/7/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key7},message:"must NOT have additional properties"};
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
if(_errs53 === errors){
if(data.name !== undefined){
const _errs54 = errors;
if(typeof data.name !== "string"){
const err44 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/7/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
var valid8 = _errs54 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data.operation !== undefined){
let data16 = data.operation;
const _errs56 = errors;
if(typeof data16 !== "string"){
const err45 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/7/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
if("create-fleet" !== data16){
const err46 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/7/properties/operation/const",keyword:"const",params:{allowedValue: "create-fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
var valid8 = _errs56 === errors;
}
else {
var valid8 = true;
}
if(valid8){
if(data.voyage !== undefined){
const _errs58 = errors;
if(typeof data.voyage !== "string"){
const err47 = {instancePath:instancePath+"/voyage",schemaPath:"#/oneOf/7/properties/voyage/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
}
}
}
}
}
else {
const err48 = {instancePath,schemaPath:"#/oneOf/7/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
var _valid0 = _errs51 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 7];
}
else {
if(_valid0){
valid0 = true;
passing0 = 7;
}
const _errs60 = errors;
if(errors === _errs60){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing8;
if(((data.operation === undefined) && (missing8 = "operation")) || ((data.voyage === undefined) && (missing8 = "voyage"))){
const err49 = {instancePath,schemaPath:"#/oneOf/8/required",keyword:"required",params:{missingProperty: missing8},message:"must have required property '"+missing8+"'"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
else {
const _errs62 = errors;
for(const key8 in data){
if(!((key8 === "operation") || (key8 === "voyage"))){
const err50 = {instancePath,schemaPath:"#/oneOf/8/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key8},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
break;
}
}
if(_errs62 === errors){
if(data.operation !== undefined){
let data18 = data.operation;
const _errs63 = errors;
if(typeof data18 !== "string"){
const err51 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/8/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
if("create-portal" !== data18){
const err52 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/8/properties/operation/const",keyword:"const",params:{allowedValue: "create-portal"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
var valid9 = _errs63 === errors;
}
else {
var valid9 = true;
}
if(valid9){
if(data.voyage !== undefined){
const _errs65 = errors;
if(typeof data.voyage !== "string"){
const err53 = {instancePath:instancePath+"/voyage",schemaPath:"#/oneOf/8/properties/voyage/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
var valid9 = _errs65 === errors;
}
else {
var valid9 = true;
}
}
}
}
}
else {
const err54 = {instancePath,schemaPath:"#/oneOf/8/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
}
var _valid0 = _errs60 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 8];
}
else {
if(_valid0){
valid0 = true;
passing0 = 8;
}
const _errs67 = errors;
if(errors === _errs67){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing9;
if((((data.operation === undefined) && (missing9 = "operation")) || ((data.typeId === undefined) && (missing9 = "typeId"))) || ((data.destination === undefined) && (missing9 = "destination"))){
const err55 = {instancePath,schemaPath:"#/oneOf/9/required",keyword:"required",params:{missingProperty: missing9},message:"must have required property '"+missing9+"'"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
else {
const _errs69 = errors;
for(const key9 in data){
if(!((((key9 === "destination") || (key9 === "launch")) || (key9 === "operation")) || (key9 === "typeId"))){
const err56 = {instancePath,schemaPath:"#/oneOf/9/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key9},message:"must NOT have additional properties"};
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
if(_errs69 === errors){
if(data.destination !== undefined){
const _errs70 = errors;
if(!(validate98(data.destination, {instancePath:instancePath+"/destination",parentData:data,parentDataProperty:"destination",rootData}))){
vErrors = vErrors === null ? validate98.errors : vErrors.concat(validate98.errors);
errors = vErrors.length;
}
var valid10 = _errs70 === errors;
}
else {
var valid10 = true;
}
if(valid10){
if(data.launch !== undefined){
let data21 = data.launch;
const _errs71 = errors;
const _errs72 = errors;
let valid11 = false;
const _errs73 = errors;
if(!(validate100(data21, {instancePath:instancePath+"/launch",parentData:data,parentDataProperty:"launch",rootData}))){
vErrors = vErrors === null ? validate100.errors : vErrors.concat(validate100.errors);
errors = vErrors.length;
}
var _valid1 = _errs73 === errors;
valid11 = valid11 || _valid1;
if(!valid11){
const _errs74 = errors;
if(data21 !== null){
const err57 = {instancePath:instancePath+"/launch",schemaPath:"#/oneOf/9/properties/launch/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
var _valid1 = _errs74 === errors;
valid11 = valid11 || _valid1;
}
if(!valid11){
const err58 = {instancePath:instancePath+"/launch",schemaPath:"#/oneOf/9/properties/launch/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
else {
errors = _errs72;
if(vErrors !== null){
if(_errs72){
vErrors.length = _errs72;
}
else {
vErrors = null;
}
}
}
var valid10 = _errs71 === errors;
}
else {
var valid10 = true;
}
if(valid10){
if(data.operation !== undefined){
let data22 = data.operation;
const _errs76 = errors;
if(typeof data22 !== "string"){
const err59 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/9/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
if("create-content" !== data22){
const err60 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/9/properties/operation/const",keyword:"const",params:{allowedValue: "create-content"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
var valid10 = _errs76 === errors;
}
else {
var valid10 = true;
}
if(valid10){
if(data.typeId !== undefined){
const _errs78 = errors;
if(typeof data.typeId !== "string"){
const err61 = {instancePath:instancePath+"/typeId",schemaPath:"#/oneOf/9/properties/typeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
var valid10 = _errs78 === errors;
}
else {
var valid10 = true;
}
}
}
}
}
}
}
else {
const err62 = {instancePath,schemaPath:"#/oneOf/9/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
}
var _valid0 = _errs67 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 9];
}
else {
if(_valid0){
valid0 = true;
passing0 = 9;
}
const _errs80 = errors;
if(errors === _errs80){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing10;
if(((data.operation === undefined) && (missing10 = "operation")) || ((data.typeId === undefined) && (missing10 = "typeId"))){
const err63 = {instancePath,schemaPath:"#/oneOf/10/required",keyword:"required",params:{missingProperty: missing10},message:"must have required property '"+missing10+"'"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
else {
const _errs82 = errors;
for(const key10 in data){
if(!((key10 === "operation") || (key10 === "typeId"))){
const err64 = {instancePath,schemaPath:"#/oneOf/10/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key10},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
break;
}
}
if(_errs82 === errors){
if(data.operation !== undefined){
let data24 = data.operation;
const _errs83 = errors;
if(typeof data24 !== "string"){
const err65 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/10/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
if("remove-content-package" !== data24){
const err66 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/10/properties/operation/const",keyword:"const",params:{allowedValue: "remove-content-package"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
var valid12 = _errs83 === errors;
}
else {
var valid12 = true;
}
if(valid12){
if(data.typeId !== undefined){
const _errs85 = errors;
if(typeof data.typeId !== "string"){
const err67 = {instancePath:instancePath+"/typeId",schemaPath:"#/oneOf/10/properties/typeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
var valid12 = _errs85 === errors;
}
else {
var valid12 = true;
}
}
}
}
}
else {
const err68 = {instancePath,schemaPath:"#/oneOf/10/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
}
var _valid0 = _errs80 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 10];
}
else {
if(_valid0){
valid0 = true;
passing0 = 10;
}
const _errs87 = errors;
if(errors === _errs87){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing11;
if(((data.operation === undefined) && (missing11 = "operation")) || ((data.typeId === undefined) && (missing11 = "typeId"))){
const err69 = {instancePath,schemaPath:"#/oneOf/11/required",keyword:"required",params:{missingProperty: missing11},message:"must have required property '"+missing11+"'"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
else {
const _errs89 = errors;
for(const key11 in data){
if(!((key11 === "operation") || (key11 === "typeId"))){
const err70 = {instancePath,schemaPath:"#/oneOf/11/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key11},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
break;
}
}
if(_errs89 === errors){
if(data.operation !== undefined){
let data26 = data.operation;
const _errs90 = errors;
if(typeof data26 !== "string"){
const err71 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/11/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
if("restore-content-package" !== data26){
const err72 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/11/properties/operation/const",keyword:"const",params:{allowedValue: "restore-content-package"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
var valid13 = _errs90 === errors;
}
else {
var valid13 = true;
}
if(valid13){
if(data.typeId !== undefined){
const _errs92 = errors;
if(typeof data.typeId !== "string"){
const err73 = {instancePath:instancePath+"/typeId",schemaPath:"#/oneOf/11/properties/typeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
var valid13 = _errs92 === errors;
}
else {
var valid13 = true;
}
}
}
}
}
else {
const err74 = {instancePath,schemaPath:"#/oneOf/11/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
}
var _valid0 = _errs87 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 11];
}
else {
if(_valid0){
valid0 = true;
passing0 = 11;
}
const _errs94 = errors;
if(errors === _errs94){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing12;
if((((data.operation === undefined) && (missing12 = "operation")) || ((data.target === undefined) && (missing12 = "target"))) || ((data.name === undefined) && (missing12 = "name"))){
const err75 = {instancePath,schemaPath:"#/oneOf/12/required",keyword:"required",params:{missingProperty: missing12},message:"must have required property '"+missing12+"'"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
else {
const _errs96 = errors;
for(const key12 in data){
if(!(((key12 === "name") || (key12 === "operation")) || (key12 === "target"))){
const err76 = {instancePath,schemaPath:"#/oneOf/12/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key12},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
break;
}
}
if(_errs96 === errors){
if(data.name !== undefined){
const _errs97 = errors;
if(typeof data.name !== "string"){
const err77 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/12/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
var valid14 = _errs97 === errors;
}
else {
var valid14 = true;
}
if(valid14){
if(data.operation !== undefined){
let data29 = data.operation;
const _errs99 = errors;
if(typeof data29 !== "string"){
const err78 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/12/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
if("rename" !== data29){
const err79 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/12/properties/operation/const",keyword:"const",params:{allowedValue: "rename"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
var valid14 = _errs99 === errors;
}
else {
var valid14 = true;
}
if(valid14){
if(data.target !== undefined){
let data30 = data.target;
const _errs101 = errors;
const _errs103 = errors;
let valid16 = false;
let passing1 = null;
const _errs104 = errors;
if(errors === _errs104){
if(data30 && typeof data30 == "object" && !Array.isArray(data30)){
let missing13;
if(((data30.kind === undefined) && (missing13 = "kind")) || ((data30.id === undefined) && (missing13 = "id"))){
const err80 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/0/required",keyword:"required",params:{missingProperty: missing13},message:"must have required property '"+missing13+"'"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
else {
const _errs106 = errors;
for(const key13 in data30){
if(!((key13 === "id") || (key13 === "kind"))){
const err81 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key13},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
break;
}
}
if(_errs106 === errors){
if(data30.id !== undefined){
const _errs107 = errors;
if(typeof data30.id !== "string"){
const err82 = {instancePath:instancePath+"/target/id",schemaPath:"#/definitions/RenameTarget/oneOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
var valid17 = _errs107 === errors;
}
else {
var valid17 = true;
}
if(valid17){
if(data30.kind !== undefined){
let data32 = data30.kind;
const _errs109 = errors;
if(typeof data32 !== "string"){
const err83 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
if("voyage" !== data32){
const err84 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
var valid17 = _errs109 === errors;
}
else {
var valid17 = true;
}
}
}
}
}
else {
const err85 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
}
var _valid2 = _errs104 === errors;
if(_valid2){
valid16 = true;
passing1 = 0;
}
const _errs111 = errors;
if(errors === _errs111){
if(data30 && typeof data30 == "object" && !Array.isArray(data30)){
let missing14;
if(((data30.kind === undefined) && (missing14 = "kind")) || ((data30.id === undefined) && (missing14 = "id"))){
const err86 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/1/required",keyword:"required",params:{missingProperty: missing14},message:"must have required property '"+missing14+"'"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
else {
const _errs113 = errors;
for(const key14 in data30){
if(!((key14 === "id") || (key14 === "kind"))){
const err87 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key14},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
break;
}
}
if(_errs113 === errors){
if(data30.id !== undefined){
const _errs114 = errors;
if(typeof data30.id !== "string"){
const err88 = {instancePath:instancePath+"/target/id",schemaPath:"#/definitions/RenameTarget/oneOf/1/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
var valid18 = _errs114 === errors;
}
else {
var valid18 = true;
}
if(valid18){
if(data30.kind !== undefined){
let data34 = data30.kind;
const _errs116 = errors;
if(typeof data34 !== "string"){
const err89 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
if("fleet" !== data34){
const err90 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
var valid18 = _errs116 === errors;
}
else {
var valid18 = true;
}
}
}
}
}
else {
const err91 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
}
}
var _valid2 = _errs111 === errors;
if(_valid2 && valid16){
valid16 = false;
passing1 = [passing1, 1];
}
else {
if(_valid2){
valid16 = true;
passing1 = 1;
}
const _errs118 = errors;
if(errors === _errs118){
if(data30 && typeof data30 == "object" && !Array.isArray(data30)){
let missing15;
if(((data30.kind === undefined) && (missing15 = "kind")) || ((data30.id === undefined) && (missing15 = "id"))){
const err92 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/2/required",keyword:"required",params:{missingProperty: missing15},message:"must have required property '"+missing15+"'"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
else {
const _errs120 = errors;
for(const key15 in data30){
if(!((key15 === "id") || (key15 === "kind"))){
const err93 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key15},message:"must NOT have additional properties"};
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
if(_errs120 === errors){
if(data30.id !== undefined){
const _errs121 = errors;
if(typeof data30.id !== "string"){
const err94 = {instancePath:instancePath+"/target/id",schemaPath:"#/definitions/RenameTarget/oneOf/2/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
var valid19 = _errs121 === errors;
}
else {
var valid19 = true;
}
if(valid19){
if(data30.kind !== undefined){
let data36 = data30.kind;
const _errs123 = errors;
if(typeof data36 !== "string"){
const err95 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
if("vessel" !== data36){
const err96 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
var valid19 = _errs123 === errors;
}
else {
var valid19 = true;
}
}
}
}
}
else {
const err97 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
}
var _valid2 = _errs118 === errors;
if(_valid2 && valid16){
valid16 = false;
passing1 = [passing1, 2];
}
else {
if(_valid2){
valid16 = true;
passing1 = 2;
}
const _errs125 = errors;
if(errors === _errs125){
if(data30 && typeof data30 == "object" && !Array.isArray(data30)){
let missing16;
if(((data30.kind === undefined) && (missing16 = "kind")) || ((data30.id === undefined) && (missing16 = "id"))){
const err98 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/3/required",keyword:"required",params:{missingProperty: missing16},message:"must have required property '"+missing16+"'"};
if(vErrors === null){
vErrors = [err98];
}
else {
vErrors.push(err98);
}
errors++;
}
else {
const _errs127 = errors;
for(const key16 in data30){
if(!((key16 === "id") || (key16 === "kind"))){
const err99 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key16},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err99];
}
else {
vErrors.push(err99);
}
errors++;
break;
}
}
if(_errs127 === errors){
if(data30.id !== undefined){
const _errs128 = errors;
if(typeof data30.id !== "string"){
const err100 = {instancePath:instancePath+"/target/id",schemaPath:"#/definitions/RenameTarget/oneOf/3/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err100];
}
else {
vErrors.push(err100);
}
errors++;
}
var valid20 = _errs128 === errors;
}
else {
var valid20 = true;
}
if(valid20){
if(data30.kind !== undefined){
let data38 = data30.kind;
const _errs130 = errors;
if(typeof data38 !== "string"){
const err101 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/3/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err101];
}
else {
vErrors.push(err101);
}
errors++;
}
if("portal" !== data38){
const err102 = {instancePath:instancePath+"/target/kind",schemaPath:"#/definitions/RenameTarget/oneOf/3/properties/kind/const",keyword:"const",params:{allowedValue: "portal"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err102];
}
else {
vErrors.push(err102);
}
errors++;
}
var valid20 = _errs130 === errors;
}
else {
var valid20 = true;
}
}
}
}
}
else {
const err103 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err103];
}
else {
vErrors.push(err103);
}
errors++;
}
}
var _valid2 = _errs125 === errors;
if(_valid2 && valid16){
valid16 = false;
passing1 = [passing1, 3];
}
else {
if(_valid2){
valid16 = true;
passing1 = 3;
}
}
}
}
if(!valid16){
const err104 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/RenameTarget/oneOf",keyword:"oneOf",params:{passingSchemas: passing1},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err104];
}
else {
vErrors.push(err104);
}
errors++;
}
else {
errors = _errs103;
if(vErrors !== null){
if(_errs103){
vErrors.length = _errs103;
}
else {
vErrors = null;
}
}
}
var valid14 = _errs101 === errors;
}
else {
var valid14 = true;
}
}
}
}
}
}
else {
const err105 = {instancePath,schemaPath:"#/oneOf/12/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err105];
}
else {
vErrors.push(err105);
}
errors++;
}
}
var _valid0 = _errs94 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 12];
}
else {
if(_valid0){
valid0 = true;
passing0 = 12;
}
const _errs132 = errors;
if(errors === _errs132){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing17;
if(((((data.operation === undefined) && (missing17 = "operation")) || ((data.fleet === undefined) && (missing17 = "fleet"))) || ((data.after === undefined) && (missing17 = "after"))) || ((data.axis === undefined) && (missing17 = "axis"))){
const err106 = {instancePath,schemaPath:"#/oneOf/13/required",keyword:"required",params:{missingProperty: missing17},message:"must have required property '"+missing17+"'"};
if(vErrors === null){
vErrors = [err106];
}
else {
vErrors.push(err106);
}
errors++;
}
else {
const _errs134 = errors;
for(const key17 in data){
if(!((((key17 === "after") || (key17 === "axis")) || (key17 === "fleet")) || (key17 === "operation"))){
const err107 = {instancePath,schemaPath:"#/oneOf/13/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key17},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err107];
}
else {
vErrors.push(err107);
}
errors++;
break;
}
}
if(_errs134 === errors){
if(data.after !== undefined){
const _errs135 = errors;
if(typeof data.after !== "string"){
const err108 = {instancePath:instancePath+"/after",schemaPath:"#/oneOf/13/properties/after/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err108];
}
else {
vErrors.push(err108);
}
errors++;
}
var valid21 = _errs135 === errors;
}
else {
var valid21 = true;
}
if(valid21){
if(data.axis !== undefined){
let data40 = data.axis;
const _errs137 = errors;
if(typeof data40 !== "string"){
const err109 = {instancePath:instancePath+"/axis",schemaPath:"#/definitions/Axis/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err109];
}
else {
vErrors.push(err109);
}
errors++;
}
if(!((data40 === "horizontal") || (data40 === "vertical"))){
const err110 = {instancePath:instancePath+"/axis",schemaPath:"#/definitions/Axis/enum",keyword:"enum",params:{allowedValues: schema162.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err110];
}
else {
vErrors.push(err110);
}
errors++;
}
var valid21 = _errs137 === errors;
}
else {
var valid21 = true;
}
if(valid21){
if(data.fleet !== undefined){
const _errs140 = errors;
if(typeof data.fleet !== "string"){
const err111 = {instancePath:instancePath+"/fleet",schemaPath:"#/oneOf/13/properties/fleet/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err111];
}
else {
vErrors.push(err111);
}
errors++;
}
var valid21 = _errs140 === errors;
}
else {
var valid21 = true;
}
if(valid21){
if(data.operation !== undefined){
let data42 = data.operation;
const _errs142 = errors;
if(typeof data42 !== "string"){
const err112 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/13/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err112];
}
else {
vErrors.push(err112);
}
errors++;
}
if("split" !== data42){
const err113 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/13/properties/operation/const",keyword:"const",params:{allowedValue: "split"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err113];
}
else {
vErrors.push(err113);
}
errors++;
}
var valid21 = _errs142 === errors;
}
else {
var valid21 = true;
}
}
}
}
}
}
}
else {
const err114 = {instancePath,schemaPath:"#/oneOf/13/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err114];
}
else {
vErrors.push(err114);
}
errors++;
}
}
var _valid0 = _errs132 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 13];
}
else {
if(_valid0){
valid0 = true;
passing0 = 13;
}
const _errs144 = errors;
if(errors === _errs144){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing18;
if(((((data.operation === undefined) && (missing18 = "operation")) || ((data.fleet === undefined) && (missing18 = "fleet"))) || ((data.path === undefined) && (missing18 = "path"))) || ((data.share === undefined) && (missing18 = "share"))){
const err115 = {instancePath,schemaPath:"#/oneOf/14/required",keyword:"required",params:{missingProperty: missing18},message:"must have required property '"+missing18+"'"};
if(vErrors === null){
vErrors = [err115];
}
else {
vErrors.push(err115);
}
errors++;
}
else {
const _errs146 = errors;
for(const key18 in data){
if(!((((key18 === "fleet") || (key18 === "operation")) || (key18 === "path")) || (key18 === "share"))){
const err116 = {instancePath,schemaPath:"#/oneOf/14/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key18},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err116];
}
else {
vErrors.push(err116);
}
errors++;
break;
}
}
if(_errs146 === errors){
if(data.fleet !== undefined){
const _errs147 = errors;
if(typeof data.fleet !== "string"){
const err117 = {instancePath:instancePath+"/fleet",schemaPath:"#/oneOf/14/properties/fleet/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err117];
}
else {
vErrors.push(err117);
}
errors++;
}
var valid23 = _errs147 === errors;
}
else {
var valid23 = true;
}
if(valid23){
if(data.operation !== undefined){
let data44 = data.operation;
const _errs149 = errors;
if(typeof data44 !== "string"){
const err118 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/14/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err118];
}
else {
vErrors.push(err118);
}
errors++;
}
if("resize-split" !== data44){
const err119 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/14/properties/operation/const",keyword:"const",params:{allowedValue: "resize-split"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err119];
}
else {
vErrors.push(err119);
}
errors++;
}
var valid23 = _errs149 === errors;
}
else {
var valid23 = true;
}
if(valid23){
if(data.path !== undefined){
let data45 = data.path;
const _errs151 = errors;
if(errors === _errs151){
if(Array.isArray(data45)){
if(data45.length > 128){
const err120 = {instancePath:instancePath+"/path",schemaPath:"#/oneOf/14/properties/path/maxItems",keyword:"maxItems",params:{limit: 128},message:"must NOT have more than 128 items"};
if(vErrors === null){
vErrors = [err120];
}
else {
vErrors.push(err120);
}
errors++;
}
else {
var valid24 = true;
const len0 = data45.length;
for(let i0=0; i0<len0; i0++){
let data46 = data45[i0];
const _errs153 = errors;
if(typeof data46 !== "string"){
const err121 = {instancePath:instancePath+"/path/" + i0,schemaPath:"#/definitions/SplitChild/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err121];
}
else {
vErrors.push(err121);
}
errors++;
}
if(!((data46 === "first") || (data46 === "second"))){
const err122 = {instancePath:instancePath+"/path/" + i0,schemaPath:"#/definitions/SplitChild/enum",keyword:"enum",params:{allowedValues: schema168.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err122];
}
else {
vErrors.push(err122);
}
errors++;
}
var valid24 = _errs153 === errors;
if(!valid24){
break;
}
}
}
}
else {
const err123 = {instancePath:instancePath+"/path",schemaPath:"#/oneOf/14/properties/path/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err123];
}
else {
vErrors.push(err123);
}
errors++;
}
}
var valid23 = _errs151 === errors;
}
else {
var valid23 = true;
}
if(valid23){
if(data.share !== undefined){
let data47 = data.share;
const _errs156 = errors;
const _errs157 = errors;
if(!(((typeof data47 == "number") && (!(data47 % 1) && !isNaN(data47))) && (isFinite(data47)))){
const err124 = {instancePath:instancePath+"/share",schemaPath:"#/definitions/SplitShare/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err124];
}
else {
vErrors.push(err124);
}
errors++;
}
if(errors === _errs157){
if((typeof data47 == "number") && (isFinite(data47))){
if(data47 > 9999 || isNaN(data47)){
const err125 = {instancePath:instancePath+"/share",schemaPath:"#/definitions/SplitShare/maximum",keyword:"maximum",params:{comparison: "<=", limit: 9999},message:"must be <= 9999"};
if(vErrors === null){
vErrors = [err125];
}
else {
vErrors.push(err125);
}
errors++;
}
else {
if(data47 < 1 || isNaN(data47)){
const err126 = {instancePath:instancePath+"/share",schemaPath:"#/definitions/SplitShare/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err126];
}
else {
vErrors.push(err126);
}
errors++;
}
}
}
}
var valid23 = _errs156 === errors;
}
else {
var valid23 = true;
}
}
}
}
}
}
}
else {
const err127 = {instancePath,schemaPath:"#/oneOf/14/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err127];
}
else {
vErrors.push(err127);
}
errors++;
}
}
var _valid0 = _errs144 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 14];
}
else {
if(_valid0){
valid0 = true;
passing0 = 14;
}
const _errs159 = errors;
if(errors === _errs159){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing19;
if(((((data.operation === undefined) && (missing19 = "operation")) || ((data.id === undefined) && (missing19 = "id"))) || ((data.target === undefined) && (missing19 = "target"))) || ((data.side === undefined) && (missing19 = "side"))){
const err128 = {instancePath,schemaPath:"#/oneOf/15/required",keyword:"required",params:{missingProperty: missing19},message:"must have required property '"+missing19+"'"};
if(vErrors === null){
vErrors = [err128];
}
else {
vErrors.push(err128);
}
errors++;
}
else {
const _errs161 = errors;
for(const key19 in data){
if(!((((key19 === "id") || (key19 === "operation")) || (key19 === "side")) || (key19 === "target"))){
const err129 = {instancePath,schemaPath:"#/oneOf/15/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key19},message:"must NOT have additional properties"};
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
if(_errs161 === errors){
if(data.id !== undefined){
const _errs162 = errors;
if(typeof data.id !== "string"){
const err130 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/15/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err130];
}
else {
vErrors.push(err130);
}
errors++;
}
var valid27 = _errs162 === errors;
}
else {
var valid27 = true;
}
if(valid27){
if(data.operation !== undefined){
let data49 = data.operation;
const _errs164 = errors;
if(typeof data49 !== "string"){
const err131 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/15/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err131];
}
else {
vErrors.push(err131);
}
errors++;
}
if("move-vessel" !== data49){
const err132 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/15/properties/operation/const",keyword:"const",params:{allowedValue: "move-vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err132];
}
else {
vErrors.push(err132);
}
errors++;
}
var valid27 = _errs164 === errors;
}
else {
var valid27 = true;
}
if(valid27){
if(data.side !== undefined){
let data50 = data.side;
const _errs166 = errors;
if(typeof data50 !== "string"){
const err133 = {instancePath:instancePath+"/side",schemaPath:"#/definitions/Side/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err133];
}
else {
vErrors.push(err133);
}
errors++;
}
if(!((((data50 === "left") || (data50 === "right")) || (data50 === "top")) || (data50 === "bottom"))){
const err134 = {instancePath:instancePath+"/side",schemaPath:"#/definitions/Side/enum",keyword:"enum",params:{allowedValues: schema170.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err134];
}
else {
vErrors.push(err134);
}
errors++;
}
var valid27 = _errs166 === errors;
}
else {
var valid27 = true;
}
if(valid27){
if(data.target !== undefined){
const _errs169 = errors;
if(typeof data.target !== "string"){
const err135 = {instancePath:instancePath+"/target",schemaPath:"#/oneOf/15/properties/target/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err135];
}
else {
vErrors.push(err135);
}
errors++;
}
var valid27 = _errs169 === errors;
}
else {
var valid27 = true;
}
}
}
}
}
}
}
else {
const err136 = {instancePath,schemaPath:"#/oneOf/15/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err136];
}
else {
vErrors.push(err136);
}
errors++;
}
}
var _valid0 = _errs159 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 15];
}
else {
if(_valid0){
valid0 = true;
passing0 = 15;
}
const _errs171 = errors;
if(errors === _errs171){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing20;
if(((((data.operation === undefined) && (missing20 = "operation")) || ((data.id === undefined) && (missing20 = "id"))) || ((data.target === undefined) && (missing20 = "target"))) || ((data.before === undefined) && (missing20 = "before"))){
const err137 = {instancePath,schemaPath:"#/oneOf/16/required",keyword:"required",params:{missingProperty: missing20},message:"must have required property '"+missing20+"'"};
if(vErrors === null){
vErrors = [err137];
}
else {
vErrors.push(err137);
}
errors++;
}
else {
const _errs173 = errors;
for(const key20 in data){
if(!((((key20 === "before") || (key20 === "id")) || (key20 === "operation")) || (key20 === "target"))){
const err138 = {instancePath,schemaPath:"#/oneOf/16/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key20},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err138];
}
else {
vErrors.push(err138);
}
errors++;
break;
}
}
if(_errs173 === errors){
if(data.before !== undefined){
const _errs174 = errors;
if(typeof data.before !== "boolean"){
const err139 = {instancePath:instancePath+"/before",schemaPath:"#/oneOf/16/properties/before/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err139];
}
else {
vErrors.push(err139);
}
errors++;
}
var valid29 = _errs174 === errors;
}
else {
var valid29 = true;
}
if(valid29){
if(data.id !== undefined){
const _errs176 = errors;
if(typeof data.id !== "string"){
const err140 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/16/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err140];
}
else {
vErrors.push(err140);
}
errors++;
}
var valid29 = _errs176 === errors;
}
else {
var valid29 = true;
}
if(valid29){
if(data.operation !== undefined){
let data54 = data.operation;
const _errs178 = errors;
if(typeof data54 !== "string"){
const err141 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/16/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err141];
}
else {
vErrors.push(err141);
}
errors++;
}
if("move-voyage" !== data54){
const err142 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/16/properties/operation/const",keyword:"const",params:{allowedValue: "move-voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err142];
}
else {
vErrors.push(err142);
}
errors++;
}
var valid29 = _errs178 === errors;
}
else {
var valid29 = true;
}
if(valid29){
if(data.target !== undefined){
const _errs180 = errors;
if(typeof data.target !== "string"){
const err143 = {instancePath:instancePath+"/target",schemaPath:"#/oneOf/16/properties/target/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err143];
}
else {
vErrors.push(err143);
}
errors++;
}
var valid29 = _errs180 === errors;
}
else {
var valid29 = true;
}
}
}
}
}
}
}
else {
const err144 = {instancePath,schemaPath:"#/oneOf/16/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err144];
}
else {
vErrors.push(err144);
}
errors++;
}
}
var _valid0 = _errs171 === errors;
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
if(((((data.operation === undefined) && (missing21 = "operation")) || ((data.id === undefined) && (missing21 = "id"))) || ((data.target === undefined) && (missing21 = "target"))) || ((data.before === undefined) && (missing21 = "before"))){
const err145 = {instancePath,schemaPath:"#/oneOf/17/required",keyword:"required",params:{missingProperty: missing21},message:"must have required property '"+missing21+"'"};
if(vErrors === null){
vErrors = [err145];
}
else {
vErrors.push(err145);
}
errors++;
}
else {
const _errs184 = errors;
for(const key21 in data){
if(!((((key21 === "before") || (key21 === "id")) || (key21 === "operation")) || (key21 === "target"))){
const err146 = {instancePath,schemaPath:"#/oneOf/17/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key21},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err146];
}
else {
vErrors.push(err146);
}
errors++;
break;
}
}
if(_errs184 === errors){
if(data.before !== undefined){
const _errs185 = errors;
if(typeof data.before !== "boolean"){
const err147 = {instancePath:instancePath+"/before",schemaPath:"#/oneOf/17/properties/before/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err147];
}
else {
vErrors.push(err147);
}
errors++;
}
var valid30 = _errs185 === errors;
}
else {
var valid30 = true;
}
if(valid30){
if(data.id !== undefined){
const _errs187 = errors;
if(typeof data.id !== "string"){
const err148 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/17/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err148];
}
else {
vErrors.push(err148);
}
errors++;
}
var valid30 = _errs187 === errors;
}
else {
var valid30 = true;
}
if(valid30){
if(data.operation !== undefined){
let data58 = data.operation;
const _errs189 = errors;
if(typeof data58 !== "string"){
const err149 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/17/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err149];
}
else {
vErrors.push(err149);
}
errors++;
}
if("move-fleet" !== data58){
const err150 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/17/properties/operation/const",keyword:"const",params:{allowedValue: "move-fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err150];
}
else {
vErrors.push(err150);
}
errors++;
}
var valid30 = _errs189 === errors;
}
else {
var valid30 = true;
}
if(valid30){
if(data.target !== undefined){
const _errs191 = errors;
if(typeof data.target !== "string"){
const err151 = {instancePath:instancePath+"/target",schemaPath:"#/oneOf/17/properties/target/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err151];
}
else {
vErrors.push(err151);
}
errors++;
}
var valid30 = _errs191 === errors;
}
else {
var valid30 = true;
}
}
}
}
}
}
}
else {
const err152 = {instancePath,schemaPath:"#/oneOf/17/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err152];
}
else {
vErrors.push(err152);
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
const _errs193 = errors;
if(errors === _errs193){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing22;
if(((data.operation === undefined) && (missing22 = "operation")) || ((data.id === undefined) && (missing22 = "id"))){
const err153 = {instancePath,schemaPath:"#/oneOf/18/required",keyword:"required",params:{missingProperty: missing22},message:"must have required property '"+missing22+"'"};
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
for(const key22 in data){
if(!((key22 === "id") || (key22 === "operation"))){
const err154 = {instancePath,schemaPath:"#/oneOf/18/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key22},message:"must NOT have additional properties"};
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
if(data.id !== undefined){
const _errs196 = errors;
if(typeof data.id !== "string"){
const err155 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/18/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err155];
}
else {
vErrors.push(err155);
}
errors++;
}
var valid31 = _errs196 === errors;
}
else {
var valid31 = true;
}
if(valid31){
if(data.operation !== undefined){
let data61 = data.operation;
const _errs198 = errors;
if(typeof data61 !== "string"){
const err156 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/18/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err156];
}
else {
vErrors.push(err156);
}
errors++;
}
if("select-voyage" !== data61){
const err157 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/18/properties/operation/const",keyword:"const",params:{allowedValue: "select-voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err157];
}
else {
vErrors.push(err157);
}
errors++;
}
var valid31 = _errs198 === errors;
}
else {
var valid31 = true;
}
}
}
}
}
else {
const err158 = {instancePath,schemaPath:"#/oneOf/18/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err158];
}
else {
vErrors.push(err158);
}
errors++;
}
}
var _valid0 = _errs193 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 18];
}
else {
if(_valid0){
valid0 = true;
passing0 = 18;
}
const _errs200 = errors;
if(errors === _errs200){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing23;
if(((data.operation === undefined) && (missing23 = "operation")) || ((data.id === undefined) && (missing23 = "id"))){
const err159 = {instancePath,schemaPath:"#/oneOf/19/required",keyword:"required",params:{missingProperty: missing23},message:"must have required property '"+missing23+"'"};
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
for(const key23 in data){
if(!((key23 === "id") || (key23 === "operation"))){
const err160 = {instancePath,schemaPath:"#/oneOf/19/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key23},message:"must NOT have additional properties"};
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
if(data.id !== undefined){
const _errs203 = errors;
if(typeof data.id !== "string"){
const err161 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/19/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err161];
}
else {
vErrors.push(err161);
}
errors++;
}
var valid32 = _errs203 === errors;
}
else {
var valid32 = true;
}
if(valid32){
if(data.operation !== undefined){
let data63 = data.operation;
const _errs205 = errors;
if(typeof data63 !== "string"){
const err162 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/19/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err162];
}
else {
vErrors.push(err162);
}
errors++;
}
if("select-fleet" !== data63){
const err163 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/19/properties/operation/const",keyword:"const",params:{allowedValue: "select-fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err163];
}
else {
vErrors.push(err163);
}
errors++;
}
var valid32 = _errs205 === errors;
}
else {
var valid32 = true;
}
}
}
}
}
else {
const err164 = {instancePath,schemaPath:"#/oneOf/19/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err164];
}
else {
vErrors.push(err164);
}
errors++;
}
}
var _valid0 = _errs200 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 19];
}
else {
if(_valid0){
valid0 = true;
passing0 = 19;
}
const _errs207 = errors;
if(errors === _errs207){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing24;
if(((data.operation === undefined) && (missing24 = "operation")) || ((data.id === undefined) && (missing24 = "id"))){
const err165 = {instancePath,schemaPath:"#/oneOf/20/required",keyword:"required",params:{missingProperty: missing24},message:"must have required property '"+missing24+"'"};
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
for(const key24 in data){
if(!((key24 === "id") || (key24 === "operation"))){
const err166 = {instancePath,schemaPath:"#/oneOf/20/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key24},message:"must NOT have additional properties"};
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
if(data.id !== undefined){
const _errs210 = errors;
if(typeof data.id !== "string"){
const err167 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/20/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err167];
}
else {
vErrors.push(err167);
}
errors++;
}
var valid33 = _errs210 === errors;
}
else {
var valid33 = true;
}
if(valid33){
if(data.operation !== undefined){
let data65 = data.operation;
const _errs212 = errors;
if(typeof data65 !== "string"){
const err168 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/20/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err168];
}
else {
vErrors.push(err168);
}
errors++;
}
if("reveal-vessel" !== data65){
const err169 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/20/properties/operation/const",keyword:"const",params:{allowedValue: "reveal-vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err169];
}
else {
vErrors.push(err169);
}
errors++;
}
var valid33 = _errs212 === errors;
}
else {
var valid33 = true;
}
}
}
}
}
else {
const err170 = {instancePath,schemaPath:"#/oneOf/20/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err170];
}
else {
vErrors.push(err170);
}
errors++;
}
}
var _valid0 = _errs207 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 20];
}
else {
if(_valid0){
valid0 = true;
passing0 = 20;
}
const _errs214 = errors;
if(errors === _errs214){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing25;
if(((data.operation === undefined) && (missing25 = "operation")) || ((data.context === undefined) && (missing25 = "context"))){
const err171 = {instancePath,schemaPath:"#/oneOf/21/required",keyword:"required",params:{missingProperty: missing25},message:"must have required property '"+missing25+"'"};
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
for(const key25 in data){
if(!((key25 === "context") || (key25 === "operation"))){
const err172 = {instancePath,schemaPath:"#/oneOf/21/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key25},message:"must NOT have additional properties"};
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
if(data.context !== undefined){
let data66 = data.context;
const _errs217 = errors;
const _errs219 = errors;
let valid36 = false;
let passing2 = null;
const _errs220 = errors;
if(errors === _errs220){
if(data66 && typeof data66 == "object" && !Array.isArray(data66)){
let missing26;
if((data66.kind === undefined) && (missing26 = "kind")){
const err173 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/0/required",keyword:"required",params:{missingProperty: missing26},message:"must have required property '"+missing26+"'"};
if(vErrors === null){
vErrors = [err173];
}
else {
vErrors.push(err173);
}
errors++;
}
else {
const _errs222 = errors;
for(const key26 in data66){
if(!(key26 === "kind")){
const err174 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key26},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err174];
}
else {
vErrors.push(err174);
}
errors++;
break;
}
}
if(_errs222 === errors){
if(data66.kind !== undefined){
let data67 = data66.kind;
if(typeof data67 !== "string"){
const err175 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err175];
}
else {
vErrors.push(err175);
}
errors++;
}
if("workspace" !== data67){
const err176 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "workspace"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err176];
}
else {
vErrors.push(err176);
}
errors++;
}
}
}
}
}
else {
const err177 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err177];
}
else {
vErrors.push(err177);
}
errors++;
}
}
var _valid3 = _errs220 === errors;
if(_valid3){
valid36 = true;
passing2 = 0;
}
const _errs225 = errors;
if(errors === _errs225){
if(data66 && typeof data66 == "object" && !Array.isArray(data66)){
let missing27;
if(((data66.kind === undefined) && (missing27 = "kind")) || ((data66.id === undefined) && (missing27 = "id"))){
const err178 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/1/required",keyword:"required",params:{missingProperty: missing27},message:"must have required property '"+missing27+"'"};
if(vErrors === null){
vErrors = [err178];
}
else {
vErrors.push(err178);
}
errors++;
}
else {
const _errs227 = errors;
for(const key27 in data66){
if(!((key27 === "id") || (key27 === "kind"))){
const err179 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key27},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err179];
}
else {
vErrors.push(err179);
}
errors++;
break;
}
}
if(_errs227 === errors){
if(data66.id !== undefined){
const _errs228 = errors;
if(typeof data66.id !== "string"){
const err180 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/1/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err180];
}
else {
vErrors.push(err180);
}
errors++;
}
var valid38 = _errs228 === errors;
}
else {
var valid38 = true;
}
if(valid38){
if(data66.kind !== undefined){
let data69 = data66.kind;
const _errs230 = errors;
if(typeof data69 !== "string"){
const err181 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err181];
}
else {
vErrors.push(err181);
}
errors++;
}
if("voyage" !== data69){
const err182 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "voyage"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err182];
}
else {
vErrors.push(err182);
}
errors++;
}
var valid38 = _errs230 === errors;
}
else {
var valid38 = true;
}
}
}
}
}
else {
const err183 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err183];
}
else {
vErrors.push(err183);
}
errors++;
}
}
var _valid3 = _errs225 === errors;
if(_valid3 && valid36){
valid36 = false;
passing2 = [passing2, 1];
}
else {
if(_valid3){
valid36 = true;
passing2 = 1;
}
const _errs232 = errors;
if(errors === _errs232){
if(data66 && typeof data66 == "object" && !Array.isArray(data66)){
let missing28;
if(((data66.kind === undefined) && (missing28 = "kind")) || ((data66.id === undefined) && (missing28 = "id"))){
const err184 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/2/required",keyword:"required",params:{missingProperty: missing28},message:"must have required property '"+missing28+"'"};
if(vErrors === null){
vErrors = [err184];
}
else {
vErrors.push(err184);
}
errors++;
}
else {
const _errs234 = errors;
for(const key28 in data66){
if(!((key28 === "id") || (key28 === "kind"))){
const err185 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key28},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err185];
}
else {
vErrors.push(err185);
}
errors++;
break;
}
}
if(_errs234 === errors){
if(data66.id !== undefined){
const _errs235 = errors;
if(typeof data66.id !== "string"){
const err186 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/2/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err186];
}
else {
vErrors.push(err186);
}
errors++;
}
var valid39 = _errs235 === errors;
}
else {
var valid39 = true;
}
if(valid39){
if(data66.kind !== undefined){
let data71 = data66.kind;
const _errs237 = errors;
if(typeof data71 !== "string"){
const err187 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err187];
}
else {
vErrors.push(err187);
}
errors++;
}
if("fleet" !== data71){
const err188 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "fleet"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err188];
}
else {
vErrors.push(err188);
}
errors++;
}
var valid39 = _errs237 === errors;
}
else {
var valid39 = true;
}
}
}
}
}
else {
const err189 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err189];
}
else {
vErrors.push(err189);
}
errors++;
}
}
var _valid3 = _errs232 === errors;
if(_valid3 && valid36){
valid36 = false;
passing2 = [passing2, 2];
}
else {
if(_valid3){
valid36 = true;
passing2 = 2;
}
const _errs239 = errors;
if(errors === _errs239){
if(data66 && typeof data66 == "object" && !Array.isArray(data66)){
let missing29;
if(((data66.kind === undefined) && (missing29 = "kind")) || ((data66.id === undefined) && (missing29 = "id"))){
const err190 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/3/required",keyword:"required",params:{missingProperty: missing29},message:"must have required property '"+missing29+"'"};
if(vErrors === null){
vErrors = [err190];
}
else {
vErrors.push(err190);
}
errors++;
}
else {
const _errs241 = errors;
for(const key29 in data66){
if(!((key29 === "id") || (key29 === "kind"))){
const err191 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key29},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err191];
}
else {
vErrors.push(err191);
}
errors++;
break;
}
}
if(_errs241 === errors){
if(data66.id !== undefined){
const _errs242 = errors;
if(typeof data66.id !== "string"){
const err192 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/3/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err192];
}
else {
vErrors.push(err192);
}
errors++;
}
var valid40 = _errs242 === errors;
}
else {
var valid40 = true;
}
if(valid40){
if(data66.kind !== undefined){
let data73 = data66.kind;
const _errs244 = errors;
if(typeof data73 !== "string"){
const err193 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/3/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err193];
}
else {
vErrors.push(err193);
}
errors++;
}
if("vessel" !== data73){
const err194 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/3/properties/kind/const",keyword:"const",params:{allowedValue: "vessel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err194];
}
else {
vErrors.push(err194);
}
errors++;
}
var valid40 = _errs244 === errors;
}
else {
var valid40 = true;
}
}
}
}
}
else {
const err195 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err195];
}
else {
vErrors.push(err195);
}
errors++;
}
}
var _valid3 = _errs239 === errors;
if(_valid3 && valid36){
valid36 = false;
passing2 = [passing2, 3];
}
else {
if(_valid3){
valid36 = true;
passing2 = 3;
}
const _errs246 = errors;
if(errors === _errs246){
if(data66 && typeof data66 == "object" && !Array.isArray(data66)){
let missing30;
if(((data66.kind === undefined) && (missing30 = "kind")) || ((data66.id === undefined) && (missing30 = "id"))){
const err196 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/4/required",keyword:"required",params:{missingProperty: missing30},message:"must have required property '"+missing30+"'"};
if(vErrors === null){
vErrors = [err196];
}
else {
vErrors.push(err196);
}
errors++;
}
else {
const _errs248 = errors;
for(const key30 in data66){
if(!((key30 === "id") || (key30 === "kind"))){
const err197 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key30},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err197];
}
else {
vErrors.push(err197);
}
errors++;
break;
}
}
if(_errs248 === errors){
if(data66.id !== undefined){
const _errs249 = errors;
if(typeof data66.id !== "string"){
const err198 = {instancePath:instancePath+"/context/id",schemaPath:"#/definitions/Context/oneOf/4/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err198];
}
else {
vErrors.push(err198);
}
errors++;
}
var valid41 = _errs249 === errors;
}
else {
var valid41 = true;
}
if(valid41){
if(data66.kind !== undefined){
let data75 = data66.kind;
const _errs251 = errors;
if(typeof data75 !== "string"){
const err199 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/4/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err199];
}
else {
vErrors.push(err199);
}
errors++;
}
if("portal" !== data75){
const err200 = {instancePath:instancePath+"/context/kind",schemaPath:"#/definitions/Context/oneOf/4/properties/kind/const",keyword:"const",params:{allowedValue: "portal"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err200];
}
else {
vErrors.push(err200);
}
errors++;
}
var valid41 = _errs251 === errors;
}
else {
var valid41 = true;
}
}
}
}
}
else {
const err201 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err201];
}
else {
vErrors.push(err201);
}
errors++;
}
}
var _valid3 = _errs246 === errors;
if(_valid3 && valid36){
valid36 = false;
passing2 = [passing2, 4];
}
else {
if(_valid3){
valid36 = true;
passing2 = 4;
}
}
}
}
}
if(!valid36){
const err202 = {instancePath:instancePath+"/context",schemaPath:"#/definitions/Context/oneOf",keyword:"oneOf",params:{passingSchemas: passing2},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err202];
}
else {
vErrors.push(err202);
}
errors++;
}
else {
errors = _errs219;
if(vErrors !== null){
if(_errs219){
vErrors.length = _errs219;
}
else {
vErrors = null;
}
}
}
var valid34 = _errs217 === errors;
}
else {
var valid34 = true;
}
if(valid34){
if(data.operation !== undefined){
let data76 = data.operation;
const _errs253 = errors;
if(typeof data76 !== "string"){
const err203 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/21/properties/operation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err203];
}
else {
vErrors.push(err203);
}
errors++;
}
if("dock" !== data76){
const err204 = {instancePath:instancePath+"/operation",schemaPath:"#/oneOf/21/properties/operation/const",keyword:"const",params:{allowedValue: "dock"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err204];
}
else {
vErrors.push(err204);
}
errors++;
}
var valid34 = _errs253 === errors;
}
else {
var valid34 = true;
}
}
}
}
}
else {
const err205 = {instancePath,schemaPath:"#/oneOf/21/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err205];
}
else {
vErrors.push(err205);
}
errors++;
}
}
var _valid0 = _errs214 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 21];
}
else {
if(_valid0){
valid0 = true;
passing0 = 21;
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
}
}
}
}
if(!valid0){
const err206 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err206];
}
else {
vErrors.push(err206);
}
errors++;
validate93.errors = vErrors;
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
validate93.errors = vErrors;
return errors === 0;
}


function validate92(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((data.expectedVersion === undefined) && (missing0 = "expectedVersion")) || ((data.action === undefined) && (missing0 = "action"))){
validate92.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!((key0 === "action") || (key0 === "expectedVersion"))){
validate92.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.action !== undefined){
const _errs2 = errors;
if(!(validate93(data.action, {instancePath:instancePath+"/action",parentData:data,parentDataProperty:"action",rootData}))){
vErrors = vErrors === null ? validate93.errors : vErrors.concat(validate93.errors);
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
validate92.errors = [{instancePath:instancePath+"/expectedVersion",schemaPath:"#/properties/expectedVersion/type",keyword:"type",params:{type: "string"},message:"must be string"}];
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
validate92.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate92.errors = vErrors;
return errors === 0;
}
