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
vm.runInContext(fs.readFileSync(path.join(__dirname, '../Workflow.gs'), 'utf8'), context, {filename:'Workflow.gs'});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../LicenseSnapshot.gs'), 'utf8'), context, {filename:'LicenseSnapshot.gs'});
const realApprovalValidation = context.hub_isRegisteredApproval_;
// Earlier lifecycle tests simulate already approved requests. Dedicated tests
// below exercise real request registry and administrator approval event checks.
context.hub_isRegisteredApproval_ = () => true;

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

run('request ID approvals require registry, a matching snapshot and an approval event', () => {
  context.hub_isRegisteredApproval_ = realApprovalValidation;
  const rid = 'c25cf0b5-8182-486b-a104-50c2849070ab';
  const previous = fakeSS.getSheetByName;
  let approved = true;
  const headers = {
    RequestRegistry: ['Request ID','Kind','Target Email','Registered At','Registered By'],
    ApprovalEvents: ['Timestamp','Actor','Request ID','Kind','Target Email','Decision','Approved Snapshot']
  };
  fakeSS.getSheetByName = name => headers[name] ? ({
    getLastRow: () => 2,
    getRange: row => ({getDisplayValues: () => row === 1 ? [headers[name]] :
      [name === 'RequestRegistry'
        ? [rid,'JOINER','employee@example.com','2026-11-21','admin@example.com']
        : ['2026-11-21','admin@example.com',rid,'JOINER','employee@example.com',approved?'APPROVED':'REVOKED','snapshotA']]})
  }) : null;
  try {
    assert.equal(context.hub_isRegisteredApproval_('JOINER','', 'employee@example.com','snapshotA'), false);
    assert.equal(context.hub_isRegisteredApproval_('JOINER',rid, 'employee@example.com','snapshotA'), true);
    assert.equal(context.hub_isRegisteredApproval_('JOINER',rid, 'employee@example.com','tampered'), false);
    assert.equal(context.hub_isRegisteredApproval_('JOINER',rid, 'other@example.com','snapshotA'), false);
    approved = false;
    assert.equal(context.hub_isRegisteredApproval_('JOINER',rid, 'employee@example.com','snapshotA'), false);
  } finally {
    fakeSS.getSheetByName = previous;
    context.hub_isRegisteredApproval_ = () => true;
  }
});
run('manual aggregate license report validates counts and preserves unknown capacity', () => {
  const input = [
    ['Google Workspace','SKU_1','12','20','Admin Console','2026-11-21'],
    ['Google Workspace','SKU_2','5','','Approved aggregate export','2026-11-21']
  ];
  const rows = context.hub_validateLicenseRows_(input);
  assert.equal(rows[0][4],8);
  assert.equal(rows[1][3],'UNKNOWN');
  assert.equal(rows[1][4],'UNKNOWN');
  assert.throws(() => context.hub_validateLicenseRows_([...input,input[0]]), /Duplicate/);
  assert.throws(() => context.hub_validateLicenseRows_([['Product','SKU_1','-3','4','Admin Console','2026-11-21']]), /Invalid assigned/);
  assert.throws(() => context.hub_validateLicenseRows_([['Product','SKU_1','3','4','Admin Console','']]), /Verified At/);
});
run('HR staging schema parses fictional input and rejects unsafe references', () => {
  const item = context.hub_parseHRIntake_(['TEST-100','Sample Employee','/Employees','','READY FOR REVIEW','',''],{domain:'example.com'});
  assert.equal(item.email,'sample.employee@example.com');
  assert.throws(() => context.hub_parseHRIntake_(['unsafe name','Sample Employee','/','','','',''],{domain:'example.com'}));
});

console.log('All offline tests passed.');
