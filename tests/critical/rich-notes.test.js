import test from 'node:test';
import assert from 'node:assert/strict';
import { applyNoteFields, readNoteFields, loadNoteFields } from '../../src/ui/rich-note-content.js';
import { appendCopiedFromTemplateNote } from '../../src/public/copy-public-to-private.js';
import { publicCopyRecordContentHash } from '../../src/public/copy-duplicates.js';
import { conflictDiffFieldDefinitions } from '../../src/ui/conflict-format.js';

test('plain edits remove stale formatted notes and remain compatible with old textareas',()=>{
  const record={note:'Old',noteHtml:'<b>Old</b>'};
  applyNoteFields(record,{value:' New '}); assert.deepEqual(record,{note:'New'});
  const field={}; loadNoteFields(field,record); assert.equal(field.value,'New');
});
test('formatted note save reads the synchronized plain text and persists both forms',()=>{
  const field={value:'Old',richNoteEditor:{getHtml(){field.value='New';return '<strong>New</strong>';}}};
  assert.deepEqual(readNoteFields(field),{note:'New',noteHtml:'<strong>New</strong>'});
  const record={};applyNoteFields(record,field);assert.equal(record.noteHtml,'<strong>New</strong>');
});
test('template attribution preserves formatted notes and escapes names',()=>{
  const record={note:'Text',noteHtml:'<p>Text</p>'};
  appendCopiedFromTemplateNote(record,'<Template>');
  assert.equal(record.noteHtml,'<p>Text</p><p>Скопировано из шаблона: &lt;Template&gt;</p>');
  assert.equal(appendCopiedFromTemplateNote(record,'<Template>'),false);
});
test('format-only changes participate in content identity and history for items and bags',()=>{
  for(const type of ['item','container']){
    const plain={name:'A',note:'Text'};
    assert.notEqual(publicCopyRecordContentHash(plain,type),publicCopyRecordContentHash({...plain,noteHtml:'<b>Text</b>'},type));
    assert.ok(conflictDiffFieldDefinitions({type}).some(([key])=>key==='noteHtml'));
  }
});


import { applyLayoutNotes } from '../../src/state/layout-notes.js';
import { compactLayoutForEntitySync } from '../../src/sync/serialize.js';
import { backupLayoutMatchesCurrent } from '../../src/backup/restore.js';
test('layout formatting persists, participates in changes and is cleared with the note',()=>{
  const layout={id:'a', notes:'Text'};
  assert.equal(applyLayoutNotes(layout,'Text','<strong>Text</strong>'),true);
  assert.equal(compactLayoutForEntitySync(layout).notesHtml,'<strong>Text</strong>');
  assert.equal(applyLayoutNotes(layout,'Text','<strong>Text</strong>'),false);
  assert.equal(backupLayoutMatchesCurrent({id:'a'}, {...layout,locked:true}),true);
  assert.equal(applyLayoutNotes(layout,''),true);
  assert.equal(layout.notes,undefined);assert.equal(layout.notesHtml,undefined);
});
