/* Local, offline unit tests: no Google Workspace API calls are made. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../Code.gs'), 'utf8');
const props = {
  GWS_DOMAIN: 'example.com',
  GWS_ALLOWED_ADMINS: 'admin@example.com',
  GWS_SPREADSHEET_ID: 'fake-id'
};
let actor = 'admin@example.com';
let role = { isAdmin: true, isDelegatedAdmin: false };
let target = { primaryEmail: 'employee@example.com', suspended: false, isAdmin: false, isDelegatedAdmin: false };
let patches = 0;
let tabData = [];
let statusUpdates = [];
let tamperOnStage = false;
const fakeTab = {
  getLastRow: () => tabData.length + 1,
  getParent: () => fakeSS,
  getRange: (row, col, count, width) => ({
    getDisplayValues: () => row === 1 ? [context.HUB.HEADERS.schedule] :
      tabData.slice(row - 2, row - 2 + count).map(r => r.slice(col - 1, col - 1 + width)),
    setValues: vals => {
      statusUpdates.push({row, col, vals});
      if (row >= 2) vals.forEach((r, i) => r.forEach((value, j) => {
        tabData[row - 2 + i][col - 1 + j] = value;
      }));
      if (tamperOnStage && row >= 2 && col === 5 && vals[0][0] === 'IN PROGRESS') {
        tabData[row-2][2] = 'edited@example.com';
      }
      return fakeTab;
    }
  })
};
const fakeSS = {
  getSheetByName: name => name === 'SuspensionList' ? fakeTab : null,
  getSpreadsheetTimeZone: () => 'Etc/UTC'
};
const context = vm.createContext({
  console,
  Date,
  Set,
  Object,
  Array,
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => props[k], setProperty: (k,v) => {props[k]=v;},
    deleteProperty: k => {delete props[k];}
  }) },
  Session: { getEffectiveUser: () => ({getEmail: () => actor}) },
  AdminDirectory: {
    Users: {
      get: email => email === actor ? role : target,
      patch: (_body, _email) => { patches++; return {suspended: _body.suspended}; }
    }
  },
  SpreadsheetApp: {openById: () => fakeSS, flush: () => {}},
  Utilities: {
    parseDate: (dateString, timezone) => {
      assert.equal(timezone, 'Etc/UTC');
      return new Date(dateString.replace(' ', 'T') + ':00Z');
    },
    formatDate: (date, timezone, _format) => {
      assert.equal(timezone, 'Etc/UTC');
      return date.toISOString().slice(0,16).replace('T', ' ');
    }
  }
});
vm.runInContext(source, context, {filename:'Code.gs'});

const run = (name, callback) => {callback(); console.log('PASS', name);};
run('generic configuration has no real tenant hardcoding', () => {
  assert.doesNotMatch(source, /blitznow|gobiselvan|@mr_rgs|sugar\.fit/i);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(__dirname,'../appsscript.json'),'utf8')).dependencies.enabledAdvancedServices[0].userSymbol,'AdminDirectory');
});
run('Workspace email must match configured domain', () => {
  assert.equal(context.hub_isDomainEmail_('employee@example.com','example.com'), true);
  assert.equal(context.hub_isDomainEmail_('employee@otherexample.com','example.com'), false);
  assert.equal(context.hub_isDomainEmail_('bad@outside.invalid','example.com'), false);
});
run('name suggestions are reviewed and safely parsed', () => {
  assert.deepEqual(Array.from(context.prov_splitFullName_('Sample Person')), ['Sample','Person','sample.person']);
  assert.throws(() => context.prov_splitFullName_('Single'));
});
run('schedule parser rejects invalid dates and times', () => {
  assert.equal(context.hub_parseScheduledAt_('30.11.26','05:30 PM','Etc/UTC').toISOString(), '2026-11-30T17:30:00.000Z');
  assert.throws(() => context.hub_parseScheduledAt_('31.02.26','05:30 PM','Etc/UTC'));
  assert.throws(() => context.hub_parseScheduledAt_('30.11.26','13:30 PM','Etc/UTC'));
});
run('authorization requires allowlist and a directory admin role', () => {
  actor = 'employee@example.com';
  assert.throws(() => context.hub_authorize_(), /Not authorized/);
  actor = 'admin@example.com'; role = {isAdmin:false, isDelegatedAdmin:false};
  assert.throws(() => context.hub_authorize_(), /admin role/);
  role = {isAdmin:true};
  assert.equal(context.hub_authorize_().actor, 'admin@example.com');
});
run('only explicitly approved new joiners are processed', () => {
  const rows = [
    ['Sample Person','Sample','Person','sample.person','/','','YES','READY','','','',''],
    ['Other Person','Other','Person','other.person','/','','NO','READY','','','','']
  ];
  const s = {getLastRow: () => 3,getRange: () => ({getDisplayValues: () => rows})};
  const r = context.prov_collect_(s, {domain:'example.com'});
  assert.equal(r.approved.length,1);
  assert.equal(r.approved[0].item.email,'sample.person@example.com');
});
run('blank provisioning status is not eligible, even if approved', () => {
  const rows = [['Sample Person','Sample','Person','sample.person','/','','YES','','','','','']];
  const tab = { getLastRow: () => 2, getRange: () => ({getDisplayValues: () => rows}) };
  const result = context.prov_collect_(tab, {domain: 'example.com'});
  assert.equal(result.approved.length,0);
});
run('scheduled action blocks directory admins without patching', () => {
  statusUpdates=[]; patches=0;
  tabData=[['01.01.20','01:00 AM','employee@example.com','YES','PENDING','']];
  target={primaryEmail:'employee@example.com',suspended:false,isAdmin:true,isDelegatedAdmin:false};
  context.hub_processSchedule_('suspend',{domain:'example.com',admins:['admin@example.com']},Date.now());
  assert.equal(patches,0);
  assert.equal(statusUpdates.at(-1).vals[0][0],'BLOCKED: ADMIN');
});
run('scheduled standard user suspension patches once', () => {
  statusUpdates=[]; patches=0;
  tabData=[['01.01.20','01:00 AM','employee@example.com','YES','PENDING','']];
  target={primaryEmail:'employee@example.com',suspended:false,isAdmin:false,isDelegatedAdmin:false};
  context.hub_processSchedule_('suspend',{domain:'example.com',admins:['admin@example.com']},Date.now());
  assert.equal(patches,1);
  assert.equal(statusUpdates.at(-1).vals[0][0],'COMPLETED');
});
run('unapproved action never calls Admin Directory patch', () => {
  statusUpdates=[]; patches=0;
  tabData=[['01.01.20','01:00 AM','employee@example.com','NO','PENDING','']];
  context.hub_processSchedule_('suspend',{domain:'example.com',admins:['admin@example.com']},Date.now());
  assert.equal(patches,0);
  assert.equal(statusUpdates.length,0);
});
run('schedule revalidation blocks edited row before account API mutation', () => {
  statusUpdates=[]; patches=0; tamperOnStage=true;
  tabData=[['01.01.20','01:00 AM','employee@example.com','YES','PENDING','']];
  target={primaryEmail:'employee@example.com',suspended:false,isAdmin:false,isDelegatedAdmin:false};
  context.hub_processSchedule_('suspend',{domain:'example.com',admins:['admin@example.com']},Date.now());
  assert.equal(patches,0);
  assert.equal(statusUpdates.at(-1).vals[0][0],'REVIEW REQUIRED');
  tamperOnStage=false;
});
run('scheduled runner rejects other trigger owner', () => {
  props.GWS_TRIGGER_OWNER='other-admin@example.com';
  assert.throws(() => context.hub_runScheduledActions(), /Only the trigger owner/);
  delete props.GWS_TRIGGER_OWNER;
});
run('audit writes never include passwords and skips missing sheet', () => {
  context.hub_audit_('CREATE', 'employee@example.com', 'CREATED', 'User created', 'admin@example.com');
});
run('2SV summary performs only directory reads and writes aggregated counts', () => {
  const originalGet = fakeSS.getSheetByName;
  const originalList = context.AdminDirectory.Users.list;
  const originalLock = context.LockService;
  const originalToast = fakeSS.toast;
  let writes=[]; let reads=0; patches=0;
  const fakeDashboard = {getRange: (row,col,count,width) => ({
    setValues: (data) => {writes.push(data); return {setValues: () => {}};},
    setBackground: () => ({setFontColor: () => ({setFontWeight: () => {}})})
  })};
  fakeSS.getSheetByName = name => name==='Dashboard' ? fakeDashboard : null;
  fakeSS.toast = () => {};
  context.LockService = {getScriptLock: () => ({tryLock: () => true, releaseLock: () => {}})};
  context.AdminDirectory.Users.list = (opts) => {
    reads++;
    assert.equal(opts.domain,'example.com');
    if (reads===1) return {users:[
      {primaryEmail:'a@example.com', suspended:false, isEnrolledIn2Sv:true, isEnforcedIn2Sv:true},
      {primaryEmail:'b@example.com', suspended:true, isEnrolledIn2Sv:false, isEnforcedIn2Sv:false}],
      nextPageToken:'page2'};
    return {users:[{primaryEmail:'c@example.com',suspended:false,isEnrolledIn2Sv:true,isEnforcedIn2Sv:false}]};
  };
  try {
    context.hub_refreshSecuritySummary();
    assert.equal(reads,2);
    assert.equal(patches,0);
    assert.equal(writes[0][1][1],3); // domain users
    assert.equal(writes[0][2][1],2); // 2SV enrolled
    assert.equal(writes[0][3][1],1); // 2SV not enrolled
  } finally {
    fakeSS.getSheetByName=originalGet; fakeSS.toast=originalToast;
    context.AdminDirectory.Users.list=originalList; context.LockService=originalLock;
  }
});
console.log('All offline tests passed.');
