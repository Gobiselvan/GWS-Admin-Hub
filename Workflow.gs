/**
 * Explicit request registration and administrator approval.
 * IDs are stable identifiers, not tamper-proof: sheet editors can modify data.
 * Keep access restricted and rely on Admin Console authoritative audit events.
 */
function hub_requestKind_(name) {
  if (name === HUB.JOINERS) return 'JOINER';
  if (name === HUB.SUSPENSIONS) return 'SUSPEND';
  if (name === HUB.REACTIVATIONS) return 'REACTIVATE';
  throw new Error('Select a New Joiners, SuspensionList or ReactivationList row.');
}
function hub_requestTarget_(kind, row, c) {
  var email = kind === 'JOINER' ? prov_parse_(row, c).email : String(row[2] || '').trim().toLowerCase();
  if (!hub_isDomainEmail_(email, c.domain)) throw new Error('Request email must belong to the configured domain.');
  return email;
}
function hub_requestSnapshot_(kind, row) {
  return JSON.stringify(kind === 'JOINER' ? row.slice(0, 6) : row.slice(0, 3));
}
function hub_registryHeaders_() { return ['Request ID','Kind','Target Email','Registered At','Registered By']; }
function hub_approvalHeaders_() { return ['Timestamp','Actor','Request ID','Kind','Target Email','Decision','Approved Snapshot']; }
function hub_findRegistered_(id) {
  var tab = hub_getTab_(HUB.REQUESTS, hub_registryHeaders_());
  var rows = tab.getLastRow() > 1 ? tab.getRange(2, 1, tab.getLastRow() - 1, 5).getDisplayValues() : [];
  return rows.filter(function(row) { return row[0] === id; });
}
function hub_isRegisteredApproval_(kind, id, email, snapshot) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''))) return false;
  var matches = hub_findRegistered_(id);
  if (matches.length !== 1 || matches[0][1] !== kind || matches[0][2].toLowerCase() !== email) return false;
  var tab = hub_getTab_(HUB.APPROVALS, hub_approvalHeaders_());
  if (tab.getLastRow() < 2) return false;
  var events = tab.getRange(2, 1, tab.getLastRow() - 1, 7).getDisplayValues();
  var last = events.filter(function(row) { return row[2] === id && row[3] === kind && row[4].toLowerCase() === email; }).pop();
  return !!last && last[5] === 'APPROVED' && typeof snapshot === 'string' && last[6] === snapshot;
}
function hub_registerId_(kind, row, target, actor, sheet) {
  var column = kind === 'JOINER' ? 13 : 7;
  var currentId = String(sheet.getRange(row, column).getDisplayValue() || '').trim();
  if (currentId) {
    var records = hub_findRegistered_(currentId);
    if (records.length !== 1 || records[0][1] !== kind || records[0][2].toLowerCase() !== target) {
      throw new Error('Request ID conflicts with its registry entry. Resolve manually; never re-use an ID.');
    }
    return currentId;
  }
  var id = Utilities.getUuid();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Failed to generate request ID.');
  // A failed write never authorizes account mutation.
  hub_getTab_(HUB.REQUESTS, hub_registryHeaders_()).appendRow([id, kind, target, new Date(), actor]);
  sheet.getRange(row, column).setNumberFormat('@').setValue(id);
  return id;
}
function hub_assignRequestIds() {
  var c = hub_authorize_(), lock = hub_lock_();
  try {
    var count = 0;
    [HUB.JOINERS, HUB.SUSPENSIONS, HUB.REACTIVATIONS].forEach(function(name) {
      var kind = hub_requestKind_(name);
      var headers = kind === 'JOINER' ? HUB.HEADERS.joiners : HUB.HEADERS.schedule;
      var tab = hub_getTab_(name, headers);
      if (tab.getLastRow() < 2) return;
      var rows = tab.getRange(2, 1, tab.getLastRow() - 1, headers.length).getDisplayValues();
      rows.forEach(function(row, i) {
        var used = kind === 'JOINER' ? row.slice(0,6).some(Boolean) : row.slice(0,3).some(Boolean);
        if (!used) return;
        var status = String(row[kind === 'JOINER' ? 7 : 4] || '').toUpperCase();
        if (['CREATED','COMPLETED','ALREADY ACTIVE','ALREADY SUSPENDED'].indexOf(status) !== -1) return;
        var target = hub_requestTarget_(kind, row, c);
        if (!row[headers.length-1]) count++;
        hub_registerId_(kind, i+2, target, c.actor, tab);
      });
    });
    hub_sheet_().toast(count + ' ID(s) assigned. Review and approve each request explicitly.', 'GWS Admin Hub', 5);
    return count;
  } finally { lock.releaseLock(); }
}
function hub_approveSelectedRequest() {
  var c = hub_authorize_(), ss = hub_sheet_();
  var tab = ss.getActiveSheet(), kind = hub_requestKind_(tab.getName());
  var selected = tab.getActiveRange();
  if (!selected || selected.getNumRows() !== 1 || selected.getRow() < 2) {
    throw new Error('Select exactly one request row.');
  }
  var headers = kind === 'JOINER' ? HUB.HEADERS.joiners : HUB.HEADERS.schedule;
  var index = selected.getRow(), lock = hub_lock_();
  try {
    var row = tab.getRange(index,1,1,headers.length).getDisplayValues()[0];
    var target = hub_requestTarget_(kind,row,c);
    var id = row[headers.length-1], registered = id ? hub_findRegistered_(id) : [];
    if (registered.length !== 1 || registered[0][1] !== kind || registered[0][2].toLowerCase() !== target) {
      throw new Error('Request ID missing or mismatched. Register requests first.');
    }
    if (kind === 'JOINER') {
      if (row[8] || row[9] || row[11]) throw new Error('Existing output; cannot reapprove.');
      if (row[7] && ['DRAFT','READY'].indexOf(row[7].toUpperCase()) === -1) {
        throw new Error('Only DRAFT or READY requests may be approved.');
      }
    } else {
      hub_parseScheduledAt_(row[0],row[1],ss.getSpreadsheetTimeZone());
      if (row[4] && ['DRAFT','PENDING'].indexOf(row[4].toUpperCase()) === -1) {
        throw new Error('Only DRAFT or PENDING requests may be approved.');
      }
    }
    var ui = SpreadsheetApp.getUi();
    if (ui.alert('Approve account request?',
      'Type: '+kind+'\nTarget: '+target+'\nID: '+id+
      '\n\nApproving only makes the request eligible for a separate manual run or scheduler.',
      ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
    var fresh = tab.getRange(index,1,1,headers.length).getDisplayValues()[0];
    if (fresh[headers.length-1] !== id || hub_requestTarget_(kind,fresh,c) !== target ||
        hub_requestSnapshot_(kind,fresh) !== hub_requestSnapshot_(kind,row) ||
        fresh[kind === 'JOINER' ? 7 : 4] !== row[kind === 'JOINER' ? 7 : 4]) {
      throw new Error('Request changed while confirming; review again.');
    }
    hub_getTab_(HUB.APPROVALS,hub_approvalHeaders_())
      .appendRow([new Date(), c.actor, id, kind, target, 'APPROVED', hub_requestSnapshot_(kind,fresh)]);
    tab.getRange(index,kind === 'JOINER' ? 7 : 4).setValue('YES');
    tab.getRange(index,kind === 'JOINER' ? 8 : 5).setValue(kind === 'JOINER' ? 'READY' : 'PENDING');
    hub_audit_('APPROVE '+kind,target,'APPROVED','Request ID '+id,c.actor);
    ss.toast('Approved and logged. Review before executing.', 'GWS Admin Hub', 5);
  } finally { lock.releaseLock(); }
}
function hub_parseHRIntake_(row,c) {
  var ref = String(row[0] || '').trim(), name = String(row[1] || '').trim();
  if (!ref || ref.length > 64 || !/^[A-Za-z0-9._-]+$/.test(ref)) {
    throw new Error('Use a unique, non-sensitive alphanumeric request reference.');
  }
  var parts = prov_splitFullName_(name), ou = String(row[2] || '/').trim();
  if (!/^\/(?:[^\r\n]{0,200})$/.test(ou)) throw new Error('Invalid OU path.');
  var recovery = String(row[3] || '').trim();
  if (recovery && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recovery)) throw new Error('Invalid recovery email.');
  return {ref:ref,full:name,first:parts[0],last:parts[1],prefix:parts[2],ou:ou,recovery:recovery,email:parts[2]+'@'+c.domain};
}
// Review-only HR staging. No real HR connector and no Directory mutations.
function hub_stageHRIntake() {
  var c = hub_authorize_(), lock = hub_lock_();
  try {
    var input = hub_getTab_(HUB.HR_INTAKE,['Reference','Full Name','Org Unit Path','Recovery Email','Status','Details','Staged Request ID']);
    var join = hub_getTab_(HUB.JOINERS,HUB.HEADERS.joiners), staged = 0, errors = 0;
    var rows = input.getLastRow() > 1 ? input.getRange(2,1,input.getLastRow()-1,7).getDisplayValues() : [];
    var existing = join.getLastRow() > 1 ? join.getRange(2,1,join.getLastRow()-1,13).getDisplayValues() : [];
    var taken = {}, refs = {};
    rows.forEach(function(row) { if (row[0]) refs[row[0]] = (refs[row[0]] || 0)+1; });
    existing.forEach(function(row) { if (row[3]) taken[row[3].toLowerCase()] = true; });
    rows.forEach(function(row,i) {
      if (row[4] !== 'READY FOR REVIEW' || row[6]) return;
      try {
        var p = hub_parseHRIntake_(row,c);
        if (refs[p.ref] !== 1) throw new Error('Duplicate HR reference.');
        if (taken[p.prefix]) throw new Error('Email prefix already in New Joiners; review manually.');
        taken[p.prefix] = true;
        var next = join.getLastRow()+1;
        join.getRange(next,1,1,13).setValues([[
          p.full,p.first,p.last,p.prefix,p.ou,p.recovery,'NO','DRAFT','','',
          'Staged from private HR Intake; review before approval.','',''
        ]]);
        var id = hub_registerId_('JOINER',next,p.email,c.actor,join);
        input.getRange(i+2,5,1,3).setValues([['STAGED','Review row '+next+' before approving.',id]]);
        hub_audit_('STAGE HR',p.email,'DRAFT','Reference '+p.ref+', request '+id,c.actor);
        staged++;
      } catch (e) {
        input.getRange(i+2,5,1,2).setValues([['REVIEW REQUIRED',hub_error_(e)]]);
        errors++;
      }
    });
    hub_sheet_().toast('Staged: '+staged+' | Review: '+errors+'. No accounts created.','HR Intake',7);
    return {staged:staged,errors:errors};
  } finally { lock.releaseLock(); }
}