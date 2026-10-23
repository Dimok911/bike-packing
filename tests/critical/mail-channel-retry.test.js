import test from 'node:test';import assert from 'node:assert/strict';
import {mountMailChannelRetry} from '../../src/auth/mail-channel-retry.js';
test('retry leaves the original form alone and follows only advertised channels for the same email',()=>{
 const button={remove(){}},events={},sent=[];let time=0;
 const original=()=>{},form={onsubmit:original,ownerDocument:{createElement:()=>button},append(node){assert.equal(node,button);}},email={value:'one@example.invalid',addEventListener:(key,fn)=>events[key]=fn,removeEventListener(){}};
 const retry=mountMailChannelRetry({form,email,send:channel=>sent.push(channel),now:()=>time,cooldownMs:1});
 assert.equal(form.onsubmit,original);assert(button.hidden);assert(retry.begin());assert.equal(retry.begin(),false);
 retry.accepted({deliveryChannel:'primary',availableDeliveryChannels:['primary','backup']},email.value);retry.finish();button.onclick();assert.deepEqual(sent,[]);
 time=2;button.onclick();assert.deepEqual(sent,['backup']);
 email.value='other@example.invalid';button.onclick();assert.equal(sent.length,1);events.input();assert(button.hidden);
 retry.accepted({deliveryChannel:'primary',availableDeliveryChannels:['primary','backup']},'one@example.invalid');assert(button.hidden);
 retry.accepted({deliveryChannel:'primary',availableDeliveryChannels:['primary']},email.value);assert(button.hidden);retry.destroy();
});
