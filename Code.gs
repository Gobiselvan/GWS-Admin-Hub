/**
 * Google Workspace Admin Hub
 * Public, configurable Google Apps Script for an administrator-owned Google Sheet.
 * No organization names, admin email addresses, credentials or tenant IDs in source.
 *
 * IMPORTANT: Account changes are real. Read README.md and SECURITY.md before use.
 */

var HUB = Object.freeze({
  MAX_NEW_USERS_PER_RUN: 50,
  RUN_LIMIT_MS: 240000,
  PROP_DOMAIN: 'GWS_DOMAIN',
  PROP_ADMINS: 'GWS_ALLOWED_ADMINS',
  PROP_SPREADSHEET: 'GWS_SPREADSHEET_ID',
  PROP_TRIGGER_OWNER: 'GWS_TRIGGER_OWNER',
  PROP_LAST_RUN: 'GWS_LAST_RUN_AT',
  PROP_LAST_STATUS: 'GWS_LAST_RUN_STATUS',
  AUDIT: 'AuditLog',
  REQUESTS: 'RequestRegistry',
  APPROVALS: 'ApprovalEvents',
  HR_INTAKE: 'HR Intake',
  LICENSE_INPUT: 'LicenseInput',
  LICENSE_SUMMARY: 'LicenseSummary',
  DASHBOARD: 'Dashboard',
  JOINERS: 'New Joiners',
  SUSPENSIONS: 'SuspensionList',
  REACTIVATIONS: 'ReactivationList',
  HEADERS: {
    joiners: [
      'Full Name', 'First Name', 'Last Name', 'Email Prefix',
      'Org Unit Path', 'Recovery Email', 'Approved', 'Status',
      'Created Email', 'Google User ID', 'Details', 'Processed At', 'Request ID'
    ],
    schedule: [
      'Date (DD.MM.YY)', 'Time (hh:mm AM/PM)', 'Mail ID',
      'Approved', 'Status', 'Log / Details', 'Request ID'
    ]
  }
});

// ── Menu and first-time configuration ────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi().createMenu('⚡ GWS Admin Hub')
    .addItem('1. Configure this Workspace', 'hub_configure')
    .addItem('2. Initialize sheets', 'hub_setupSheets')
    .addItem('3. Register requests / assign IDs', 'hub_assignRequestIds')
    .addItem('Approve selected request (admin only)', 'hub_approveSelectedRequest')
    .addItem('Stage HR intake for review (no provisioning)', 'hub_stageHRIntake')
    .addItem('Check configuration / permissions', 'hub_checkConfiguration')
    .addItem('Refresh operational dashboard', 'hub_refreshDashboard')
    .addItem('Refresh read-only 2SV summary', 'hub_refreshSecuritySummary')
    .addItem('Refresh manual license snapshot', 'hub_refreshLicenseSnapshot')
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu('👤 New joiners')
      .addItem('Fill missing names and prefixes', 'prov_fillMissingNames')
      .addItem('Validate approved rows (dry run)', 'prov_validatePendingRows')
      .addItem('Create approved users (confirm)', 'prov_createPendingUsers'))
    .addSubMenu(SpreadsheetApp.getUi().createMenu('⛔ Suspensions')
      .addItem('Process due approved suspensions', 'susp_processUserSuspensions'))
    .addSubMenu(SpreadsheetApp.getUi().createMenu('♻️ Reactivations')
      .addItem('Process due approved reactivations', 'react_processPendingUsers'))
    .addSeparator()
    .addItem('Enable checks every 5 minutes', 'hub_installTrigger')
    .addItem('Disable scheduled checks', 'hub_removeTrigger')
    .addToUi();
}

function hub_configure() {
  var ui = SpreadsheetApp.getUi();
  var effective = String(Session.getEffectiveUser().getEmail() || '').toLowerCase().trim();
  if (!effective) throw new Error('Cannot determine your signed-in account.');
  var props = PropertiesService.getScriptProperties();
  var configured = String(props.getProperty(HUB.PROP_ADMINS) || '').toLowerCase()
    .split(',').map(function(x) { return x.trim(); }).filter(Boolean);
  if (configured.length && configured.indexOf(effective) === -1) {
    throw new Error('Only an existing authorized administrator can change configuration.');
  }
  var d = ui.prompt('Workspace domain', 'Enter your verified primary domain, e.g. example.com (no @):', ui.ButtonSet.OK_CANCEL);
  if (d.getSelectedButton() !== ui.Button.OK) return;
  var domain = String(d.getResponseText()).toLowerCase().trim();
  if (!/^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    throw new Error('Enter a valid Workspace domain, without @ or https://.');
  }
  if (!effective.endsWith('@' + domain)) {
    throw new Error('You must configure the domain using an administrator account on that domain.');
  }
  // Prove the user is an admin using the tenant directory, not only a sheet entry.
  hub_requireDirectoryAdmin_(effective);
  var a = ui.prompt('Authorized administrators',
    'Comma-separated Workspace admin email addresses. Include your own address. Keep the spreadsheet restricted to these people.',
    ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  var admins = String(a.getResponseText()).toLowerCase().split(',')
    .map(function(x) { return x.trim(); }).filter(Boolean);
  if (!admins.length || admins.indexOf(effective) === -1 ||
      admins.some(function(x) { return !hub_isDomainEmail_(x, domain); })) {
    throw new Error('Include your own account and use only addresses from @' + domain + '.');
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('This project must be bound to a Google Sheet.');
  props.setProperties({
    GWS_DOMAIN: domain,
    GWS_ALLOWED_ADMINS: Array.from(new Set(admins)).join(','),
    GWS_SPREADSHEET_ID: ss.getId()
  });
  ui.alert('Configuration saved for this Apps Script project. Next: Initialize sheets.');
}

function hub_checkConfiguration() {
  var c = hub_authorize_();
  var ss = hub_sheet_();
  SpreadsheetApp.getUi().alert(
    'Configuration OK.\nDomain: ' + c.domain +
    '\nAuthorized admin: ' + c.actor +
    '\nSpreadsheet: ' + ss.getName() +
    '\nTimezone: ' + ss.getSpreadsheetTimeZone() +
    '\nDirectory administrator role verified.'
  );
}

function hub_config_() {
  var p = PropertiesService.getScriptProperties();
  var domain = String(p.getProperty(HUB.PROP_DOMAIN) || '').toLowerCase().trim();
  var admins = String(p.getProperty(HUB.PROP_ADMINS) || '').toLowerCase().split(',')
    .map(function(x) { return x.trim(); }).filter(Boolean);
  var sheetId = p.getProperty(HUB.PROP_SPREADSHEET);
  if (!domain || !admins.length || !sheetId) {
    throw new Error('Not configured. Use GWS Admin Hub > Configure this Workspace first.');
  }
  return { domain: domain, admins: admins, sheetId: sheetId };
}

function hub_isDomainEmail_(email, domain) {
  return /^[a-z0-9][a-z0-9._+\-]*@[a-z0-9.-]+$/.test(email) &&
    email.toLowerCase().endsWith('@' + domain.toLowerCase());
}

function hub_requireDirectoryAdmin_(email) {
  if (typeof AdminDirectory === 'undefined') {
    throw new Error('Enable Admin SDK Directory advanced service first (see README).');
  }
  var record = AdminDirectory.Users.get(email);
  if (!(record.isAdmin === true || record.isDelegatedAdmin === true)) {
    throw new Error('The executing account must hold a Google Workspace admin role.');
  }
  return record;
}

function hub_authorize_() {
  var c = hub_config_();
  var actor = String(Session.getEffectiveUser().getEmail() || '').toLowerCase().trim();
  if (!actor || c.admins.indexOf(actor) === -1 || !hub_isDomainEmail_(actor, c.domain)) {
    throw new Error('Not authorized to operate this Workspace administration project.');
  }
  hub_requireDirectoryAdmin_(actor);
  c.actor = actor;
  return c;
}

function hub_sheet_() {
  return SpreadsheetApp.openById(hub_config_().sheetId);
}

function hub_lock_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('Another Admin Hub operation is running.');
  return lock;
}

function hub_safeText_(input) {
  var s = String(input == null ? '' : input).replace(/[\r\n\t]/g, ' ').slice(0, 400);
  return /^[=+@\-]/.test(s) ? "'" + s : s; // Avoid Sheets formula interpretation.
}

function hub_error_(e) {
  // No passwords or raw API response objects in logs or sheet output.
  return hub_safeText_(String(e && e.message ? e.message : e)).slice(0, 250);
}

function hub_ensureSheet_(ss, name, headers, headerColor) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  // Append IDs to recognized legacy layouts without shifting existing data.
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  var existing = sheet.getLastRow() ? sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0] : [];
  if (existing.length && existing.join('|') !== headers.join('|')) {
    var idMigration = (name === HUB.JOINERS || name === HUB.SUSPENSIONS || name === HUB.REACTIVATIONS) &&
      existing.slice(0, -1).join('|') === headers.slice(0, -1).join('|') && !existing[headers.length-1];
    if (!idMigration) throw new Error(name + ' contains an unexpected layout. Back it up; no data was overwritten.');
  }
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setBackground(headerColor)
    .setFontColor('#ffffff').setFontWeight('bold').setWrap(true);
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 44);
  sheet.setColumnWidths(1, headers.length, 175);
  sheet.setColumnWidth(headers.length, 420);
  if (sheet.getMaxRows() > 1) {
    sheet.getRange(2, 1, sheet.getMaxRows() - 1, Math.min(headers.length, 6)).setNumberFormat('@');
  }
  return sheet;
}

function hub_setupSheets() {
  hub_authorize_();
  var ss = hub_sheet_();
  var lock = hub_lock_();
  try {
    hub_ensureSheet_(ss, HUB.JOINERS, HUB.HEADERS.joiners, '#17365d');
    hub_ensureSheet_(ss, HUB.SUSPENSIONS, HUB.HEADERS.schedule, '#a61b1b');
    hub_ensureSheet_(ss, HUB.REACTIVATIONS, HUB.HEADERS.schedule, '#137333');
    hub_ensureSheet_(ss, HUB.AUDIT, ['Timestamp', 'Actor', 'Operation', 'Target Email', 'Outcome', 'Detail'], '#343a40');
    hub_ensureSheet_(ss, HUB.REQUESTS, ['Request ID', 'Kind', 'Target Email', 'Registered At', 'Registered By'], '#374151');
    hub_ensureSheet_(ss, HUB.APPROVALS, ['Timestamp', 'Actor', 'Request ID', 'Kind', 'Target Email', 'Decision', 'Approved Snapshot'], '#374151');
    hub_ensureSheet_(ss, HUB.HR_INTAKE, ['Reference', 'Full Name', 'Org Unit Path', 'Recovery Email', 'Status', 'Details', 'Staged Request ID'], '#4f46e5');
    hub_ensureSheet_(ss, HUB.LICENSE_INPUT, ['Product', 'SKU', 'Assigned', 'Purchased', 'Source', 'Verified At'], '#1d4ed8');
    hub_ensureSheet_(ss, HUB.LICENSE_SUMMARY, ['Product', 'SKU', 'Assigned', 'Purchased', 'Available', 'Source', 'Updated At'], '#2563eb');
    ss.toast('Sheets ready. Approve rows explicitly before processing.', 'GWS Admin Hub', 6);
  } finally { lock.releaseLock(); }
}

function hub_getTab_(name, headers) {
  var sheet = hub_sheet_().getSheetByName(name);
  if (!sheet || sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0].join('|') !== headers.join('|')) {
    throw new Error('Missing or modified ' + name + ' headers. Initialize sheets (see README).');
  }
  return sheet;
}

// Audit entries contain metadata only; never record credentials or API tokens.
// A logging error must not cause an already-performed account action to retry.
function hub_audit_(operation, targetEmail, outcome, detail, actor) {
  try {
    var ss = hub_sheet_();
    var tab = ss.getSheetByName(HUB.AUDIT);
    if (!tab) return; // Existing installations must initialize sheets after upgrading.
    tab.appendRow([new Date(), actor || '', operation, targetEmail || '', outcome,
      hub_safeText_(detail || '')]);
  } catch (e) {
    Logger.log('Audit logging failed; inspect private sheet and execution history.');
  }
}

// Verify the exact row immediately before a directory mutation. Do not rely
// on an earlier in-memory snapshot when a spreadsheet can be edited or sorted.
function hub_verifyJoinerRow_(sheet, rowNumber, expectedEmail, config) {
  var r = sheet.getRange(rowNumber, 1, 1, HUB.HEADERS.joiners.length).getDisplayValues()[0];
  if (r[6].trim().toUpperCase() !== 'YES' || r[7].trim().toUpperCase() !== 'IN PROGRESS' ||
      prov_parse_(r, config).email !== expectedEmail || !hub_isRegisteredApproval_('JOINER', r[12], expectedEmail, hub_requestSnapshot_('JOINER', r))) {
    throw new Error('Row changed after staging; inspect the request before retrying.');
  }
}

// ── New joiner provisioning ──────────────────────────────────────────────────
function prov_splitFullName_(full) {
  var name = String(full || '').trim().replace(/\s+/g, ' ');
  var parts = name.split(' ');
  if (parts.length < 2) throw new Error('Use First Name and Last Name columns for single-word names.');
  var last = parts.pop();
  var first = parts.join(' ');
  function slug(v) {
    return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['’]/g, '');
  }
  var prefix = slug(parts[0]) + '.' + slug(last);
  if (!/^[a-z][a-z0-9.-]{0,63}$/.test(prefix)) {
    throw new Error('Use a manually reviewed email prefix for this name.');
  }
  return [first, last, prefix];
}

function prov_fillMissingNames_ (sheet, from, through) {
  if (through < from) return;
  var values = sheet.getRange(from, 1, through - from + 1, 12).getDisplayValues();
  values.forEach(function(r, index) {
    var full = r[0].trim(), status = r[7].trim();
    if (!full || status || !(!r[1] || !r[2] || !r[3])) return;
    try {
      var derived = prov_splitFullName_(full);
      var fields = [r[1] || derived[0], r[2] || derived[1], r[3] || derived[2]];
      sheet.getRange(from + index, 2, 1, 3).setValues([fields]);
    } catch (e) {
      sheet.getRange(from + index, 11).setValue(hub_error_(e));
    }
  });
}

// Simple trigger: only changes sheet cells; does NOT call the Directory API.
function onEdit(e) {
  if (!e || !e.range || e.range.getSheet().getName() !== HUB.JOINERS) return;
  if (e.range.getColumn() !== 1 || e.range.getLastRow() < 2) return;
  var sheet = e.range.getSheet();
  prov_fillMissingNames_(sheet, Math.max(e.range.getRow(), 2), e.range.getLastRow());
}

function prov_fillMissingNames() {
  hub_authorize_();
  var lock = hub_lock_();
  try {
    var s = hub_getTab_(HUB.JOINERS, HUB.HEADERS.joiners);
    if (s.getLastRow() > 1) prov_fillMissingNames_(s, 2, s.getLastRow());
    s.getParent().toast('Name suggestions generated; review before approving.', 'GWS Admin Hub', 5);
  } finally { lock.releaseLock(); }
}

function prov_parse_(r, c) {
  var first = r[1].trim(), last = r[2].trim(), prefix = r[3].trim().toLowerCase();
  if (!first || !last || !prefix) throw new Error('First Name, Last Name and Email Prefix are required.');
  var email = prefix.indexOf('@') === -1 ? prefix + '@' + c.domain : prefix;
  if (!hub_isDomainEmail_(email, c.domain) || !/^[a-z0-9][a-z0-9._-]*$/.test(email.split('@')[0])) {
    throw new Error('Invalid email address for the configured domain.');
  }
  var ou = r[4].trim() || '/';
  if (!/^\/(?:[^\r\n]{0,200})$/.test(ou)) throw new Error('Org Unit Path must start with /.');
  var recovery = r[5].trim();
  if (recovery && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recovery)) {
    throw new Error('Recovery Email is invalid.');
  }
  return { first: first, last: last, email: email, ou: ou, recovery: recovery };
}

function prov_collect_(s, c) {
  if (s.getLastRow() < 2) return { approved: [], errors: [] };
  var values = s.getRange(2, 1, s.getLastRow() - 1, HUB.HEADERS.joiners.length).getDisplayValues();
  var counts = {};
  values.forEach(function(r) {
    var p = r[3].trim().toLowerCase();
    if (p) {
      var email = p.indexOf('@') >= 0 ? p : p + '@' + c.domain;
      counts[email] = (counts[email] || 0) + 1;
    }
  });
  var approved = [], errors = [];
  values.forEach(function(r, i) {
    var row = i + 2, approval = r[6].trim().toUpperCase(), status = r[7].trim().toUpperCase();
    // A blank status is NEVER eligible for account creation.
    if (approval !== 'YES' || status !== 'READY') return;
    try {
      if (r[8].trim() || r[9].trim() || r[11].trim()) throw new Error('Existing output; do not reuse this row.');
      var item = prov_parse_(r, c);
      if (!hub_isRegisteredApproval_('JOINER', r[12], item.email, hub_requestSnapshot_('JOINER', r))) throw new Error('Request ID or authorized approval is missing.');
      if (counts[item.email] > 1) throw new Error('Duplicate email in the sheet.');
      approved.push({ row: row, item: item });
    } catch (e) { errors.push({ row: row, message: hub_error_(e) }); }
  });
  return { approved: approved, errors: errors };
}

function prov_validatePendingRows() {
  var c = hub_authorize_();
  var s = hub_getTab_(HUB.JOINERS, HUB.HEADERS.joiners);
  var items = prov_collect_(s, c);
  var detail = items.errors.slice(0, 10).map(function(e) { return 'Row ' + e.row + ': ' + e.message; }).join('\n');
  SpreadsheetApp.getUi().alert('Approved valid rows: ' + items.approved.length +
    '\nInvalid approved rows: ' + items.errors.length +
    '\nNo accounts were created.' + (detail ? '\n\n' + detail : ''));
}

function prov_createPendingUsers() {
  hub_authorize_();
  hub_getTab_(HUB.JOINERS, HUB.HEADERS.joiners);
  var page = HtmlService.createHtmlOutputFromFile('ProvisionDialog')
    .setWidth(650).setHeight(540);
  SpreadsheetApp.getUi().showModalDialog(page, 'Confirm Google Workspace account creation');
}

function prov_runCreation(passwords) {
  var c = hub_authorize_();
  if (!Array.isArray(passwords) || passwords.length !== HUB.MAX_NEW_USERS_PER_RUN ||
      new Set(passwords).size !== HUB.MAX_NEW_USERS_PER_RUN ||
      !passwords.every(function(p) { return typeof p === 'string' && p.length === 16 &&
        /^[A-Za-z0-9!#@%]+$/.test(p) && /[a-z]/.test(p) && /[A-Z]/.test(p) &&
        /[0-9]/.test(p) && /[!#@%]/.test(p); })) {
    throw new Error('Password batch must contain unique strong 16-character passwords.');
  }
  var lock = hub_lock_();
  var results = [], skipped = 0, began = Date.now();
  try {
    var s = hub_getTab_(HUB.JOINERS, HUB.HEADERS.joiners);
    var candidates = prov_collect_(s, c).approved.slice(0, HUB.MAX_NEW_USERS_PER_RUN);
    for (var i = 0; i < candidates.length; i++) {
      if (Date.now() - began > HUB.RUN_LIMIT_MS) { skipped = candidates.length - i; break; }
      var rowNum = candidates[i].row, item = candidates[i].item, pw = passwords[i];
      s.getRange(rowNum, 8, 1, 5).setValues([[
        'IN PROGRESS', item.email, '', 'Creation attempt started; check Admin Console if interrupted.', new Date()
      ]]);
      SpreadsheetApp.flush();
      try {
        // Verify approval, email and staged status before the external request.
        hub_verifyJoinerRow_(s, rowNum, item.email, c);
        // Avoid overwriting or resetting any existing account, including aliases.
        var user;
        try { user = AdminDirectory.Users.get(item.email); }
        catch (lookErr) {
          if (!hub_isNotFound_(lookErr)) throw lookErr;
        }
        if (user) throw new Error('Account already exists; review in Admin Console.');
        var body = {
          primaryEmail: item.email,
          name: { givenName: item.first, familyName: item.last },
          orgUnitPath: item.ou,
          password: pw,
          changePasswordAtNextLogin: true
        };
        if (item.recovery) body.recoveryEmail = item.recovery;
        var made = AdminDirectory.Users.insert(body);
        if (!made || !made.id) throw new Error('No confirmed user ID; check Admin Console.');
        s.getRange(rowNum, 8, 1, 5).setValues([[
          'CREATED', made.primaryEmail || item.email, String(made.id),
          'Account created. Check licenses in Google Admin Console.', new Date()
        ]]);
        results.push({ email: made.primaryEmail || item.email, password: pw });
        hub_audit_('CREATE', item.email, 'CREATED', 'User account created.', c.actor);
      } catch (e) {
        // Do not retry automatically: an API timeout may occur after account creation.
        s.getRange(rowNum, 8).setValue('REVIEW REQUIRED');
        s.getRange(rowNum, 11).setValue(hub_error_(e) + ' Check Admin Console before retry.');
        hub_audit_('CREATE', item.email, 'REVIEW REQUIRED', 'Check Admin Console before retry.', c.actor);
      }
      SpreadsheetApp.flush();
    }
    return {
      created: results, processed: candidates.length - skipped,
      unprocessed: skipped, message: 'Credentials are shown once. Store them in an approved password manager.'
    };
  } finally { lock.releaseLock(); }
}

function hub_isNotFound_(e) {
  var message = String(e && e.message ? e.message : e || '');
  return /(^|\D)404(\D|$)|not found|resource not found/i.test(message);
}

// ── Scheduled suspension and reactivation ────────────────────────────────────
function hub_parseScheduledAt_(dateText, timeText, timezone) {
  var d = String(dateText || '').trim().match(/^(\d{2})[.\/-](\d{2})[.\/-](\d{2}|\d{4})$/);
  var t = String(timeText || '').trim().toUpperCase().match(/^(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)$/);
  if (!d || !t) throw new Error('Use DD.MM.YY and hh:mm AM/PM (e.g. 30.11.26 / 05:30 PM).');
  var year = Number(d[3]); if (year < 100) year += 2000;
  var month = Number(d[2]), day = Number(d[1]);
  var midnight = new Date(Date.UTC(year, month - 1, day));
  if (midnight.getUTCFullYear() !== year || midnight.getUTCMonth() !== month - 1 ||
      midnight.getUTCDate() !== day) throw new Error('Invalid calendar date.');
  var hours = Number(t[1]) % 12 + (t[3] === 'PM' ? 12 : 0);
  var canonical = year + '-' + ('0' + month).slice(-2) + '-' + ('0' + day).slice(-2) +
    ' ' + ('0' + hours).slice(-2) + ':' + t[2];
  var result = Utilities.parseDate(canonical, timezone, 'yyyy-MM-dd HH:mm');
  if (!result || Utilities.formatDate(result, timezone, 'yyyy-MM-dd HH:mm') !== canonical) {
    throw new Error('Time is invalid in the spreadsheet timezone.');
  }
  return result;
}

function hub_processSchedule_(mode, c, started) {
  var targetSheet = mode === 'suspend' ? HUB.SUSPENSIONS : HUB.REACTIVATIONS;
  var s = hub_getTab_(targetSheet, HUB.HEADERS.schedule);
  if (s.getLastRow() < 2) return { completed: 0, review: 0 };
  var ss = s.getParent(), timezone = ss.getSpreadsheetTimeZone();
  var rows = s.getRange(2, 1, s.getLastRow() - 1, HUB.HEADERS.schedule.length).getDisplayValues();
  var now = new Date(), completed = 0, review = 0;
  for (var i = 0; i < rows.length; i++) {
    if (Date.now() - started > HUB.RUN_LIMIT_MS) break;
    var row = rows[i], approval = row[3].trim().toUpperCase(), status = row[4].trim().toUpperCase();
    if (approval !== 'YES' || status !== 'PENDING') continue;
    var r = i + 2, email = row[2].trim().toLowerCase();
    var outcome = '', detail = '';
    try {
      if (!hub_isDomainEmail_(email, c.domain)) throw new Error('Invalid email for configured Workspace domain.');
      if (!hub_isRegisteredApproval_(mode === 'suspend' ? 'SUSPEND' : 'REACTIVATE', row[6], email, hub_requestSnapshot_(mode === 'suspend' ? 'SUSPEND' : 'REACTIVATE', row))) throw new Error('Missing registered request or administrator approval.');
      var due = hub_parseScheduledAt_(row[0], row[1], timezone);
      if (due > now) continue;
      if (c.admins.indexOf(email) !== -1) {
        outcome = 'BLOCKED: ADMIN';
        detail = 'Protected configured administrator; use Admin Console for admin accounts.';
      } else {
        // Stage status before an external mutation to avoid automatic retries.
        s.getRange(r, 5, 1, 2).setValues([['IN PROGRESS', 'Checking directory account...']]);
        SpreadsheetApp.flush();
        var current = s.getRange(r, 1, 1, HUB.HEADERS.schedule.length).getDisplayValues()[0];
        if (current[2].trim().toLowerCase() !== email ||
            current[0] !== row[0] || current[1] !== row[1] ||
            current[6] !== row[6] ||
            current[3].trim().toUpperCase() !== 'YES' ||
            current[4].trim().toUpperCase() !== 'IN PROGRESS' ||
            !hub_isRegisteredApproval_(mode === 'suspend' ? 'SUSPEND' : 'REACTIVATE', row[6], email, hub_requestSnapshot_(mode === 'suspend' ? 'SUSPEND' : 'REACTIVATE', row))) {
          throw new Error('Scheduled row was modified during processing.');
        }
        var user = AdminDirectory.Users.get(email);
        if (user.isAdmin === true || user.isDelegatedAdmin === true ||
            c.admins.indexOf(String(user.primaryEmail || '').toLowerCase()) !== -1) {
          outcome = 'BLOCKED: ADMIN';
          detail = 'Directory administrator accounts cannot be changed by this tool.';
        } else if (!hub_isDomainEmail_(String(user.primaryEmail || '').toLowerCase(), c.domain)) {
          throw new Error('Account resolved outside the configured domain.');
        } else if (mode === 'suspend' && user.suspended === true) {
          outcome = 'ALREADY SUSPENDED'; detail = 'Account was already suspended.';
        } else if (mode === 'reactivate' && user.suspended === false) {
          outcome = 'ALREADY ACTIVE'; detail = 'Account was already active.';
        } else {
          var next = mode === 'suspend';
          var updated = AdminDirectory.Users.patch({ suspended: next }, user.id || email);
          // A patch can succeed even if the API response is ambiguous: do not retry.
          if (!updated || updated.suspended !== next) {
            throw new Error('Update was not confirmed. Check Admin Console.');
          }
          outcome = 'COMPLETED'; detail = next ? 'Account suspended.' : 'Account reactivated.';
          completed++;
        }
      }
    } catch (e) {
      outcome = 'REVIEW REQUIRED'; detail = hub_error_(e) + '. Check Admin Console before re-approving.';
      review++;
    }
    detail += ' Checked: ' + Utilities.formatDate(new Date(), timezone, 'yyyy-MM-dd HH:mm:ss') + ' (' + timezone + ')';
    s.getRange(r, 5, 1, 2).setValues([[outcome, hub_safeText_(detail)]]);
    hub_audit_(mode === 'suspend' ? 'SUSPEND' : 'REACTIVATE', email, outcome, detail, c.actor);
    SpreadsheetApp.flush();
  }
  return { completed: completed, review: review };
}

function susp_processUserSuspensions() {
  var c = hub_authorize_(), lock = hub_lock_();
  try { hub_processSchedule_('suspend', c, Date.now()); }
  finally { lock.releaseLock(); }
}

function react_processPendingUsers() {
  var c = hub_authorize_(), lock = hub_lock_();
  try { hub_processSchedule_('reactivate', c, Date.now()); }
  finally { lock.releaseLock(); }
}

// Triggers execute as the account that installed them. A stored owner prevents
// different admins from unknowingly creating duplicate schedules.
function hub_runScheduledActions() {
  var c = hub_authorize_();
  var props = PropertiesService.getScriptProperties();
  var owner = String(props.getProperty(HUB.PROP_TRIGGER_OWNER) || '').toLowerCase();
  if (owner && owner !== c.actor) throw new Error('Only the trigger owner may run scheduled actions.');
  var lock = hub_lock_(), started = Date.now(), summary;
  try {
    var susp = hub_processSchedule_('suspend', c, started);
    var react = hub_processSchedule_('reactivate', c, started);
    summary = 'Suspended: ' + susp.completed + '; Reactivated: ' + react.completed +
      '; Review required: ' + (susp.review + react.review);
    props.setProperty(HUB.PROP_LAST_STATUS, summary);
  } catch (e) {
    props.setProperty(HUB.PROP_LAST_STATUS, 'FAILED — check execution logs and review sheets');
    throw e;
  } finally {
    props.setProperty(HUB.PROP_LAST_RUN, new Date().toISOString());
    lock.releaseLock();
  }
}

function hub_installTrigger() {
  var c = hub_authorize_();
  hub_getTab_(HUB.SUSPENSIONS, HUB.HEADERS.schedule);
  hub_getTab_(HUB.REACTIVATIONS, HUB.HEADERS.schedule);
  var props = PropertiesService.getScriptProperties();
  var owner = String(props.getProperty(HUB.PROP_TRIGGER_OWNER) || '').toLowerCase();
  if (owner && owner !== c.actor) {
    throw new Error('Scheduled checks are owned by another admin (' + owner + '). Ask that admin to disable their trigger first.');
  }
  var lock = hub_lock_();
  try {
    // Only the current user's triggers are visible to Apps Script.
    ScriptApp.getProjectTriggers().forEach(function(t) {
      if (t.getHandlerFunction() === 'hub_runScheduledActions') ScriptApp.deleteTrigger(t);
    });
    ScriptApp.newTrigger('hub_runScheduledActions').timeBased().everyMinutes(5).create();
    props.setProperty(HUB.PROP_TRIGGER_OWNER, c.actor);
  } finally { lock.releaseLock(); }
  SpreadsheetApp.getUi().alert('Scheduled checks installed by ' + c.actor + '. Only this account should own the automation trigger.');
}

function hub_removeTrigger() {
  var c = hub_authorize_();
  var props = PropertiesService.getScriptProperties();
  var owner = String(props.getProperty(HUB.PROP_TRIGGER_OWNER) || '').toLowerCase();
  if (owner && owner !== c.actor) throw new Error('Only the trigger owner may disable scheduled checks. Contact ' + owner + '.');
  var lock = hub_lock_();
  try {
    ScriptApp.getProjectTriggers().forEach(function(t) {
      if (t.getHandlerFunction() === 'hub_runScheduledActions') ScriptApp.deleteTrigger(t);
    });
    props.deleteProperty(HUB.PROP_TRIGGER_OWNER);
  } finally { lock.releaseLock(); }
}

// Read-only status dashboard. Summary values are computed from the private
// spreadsheet; no employees or credentials are copied to GitHub.
function hub_refreshDashboard() {
  var c = hub_authorize_(), lock = hub_lock_();
  try {
    var ss = hub_sheet_();
    var tab = ss.getSheetByName(HUB.DASHBOARD) || ss.insertSheet(HUB.DASHBOARD);
    var join = hub_getTab_(HUB.JOINERS, HUB.HEADERS.joiners);
    var susp = hub_getTab_(HUB.SUSPENSIONS, HUB.HEADERS.schedule);
    var react = hub_getTab_(HUB.REACTIVATIONS, HUB.HEADERS.schedule);
    function getRows(sheet, width) {
      return sheet.getLastRow() > 1
        ? sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getDisplayValues() : [];
    }
    var j = getRows(join, 12), s = getRows(susp, 6), r = getRows(react, 6);
    var ready = j.filter(function(x){ return x[6].trim().toUpperCase() === 'YES' && x[7].trim().toUpperCase() === 'READY'; }).length;
    var created = j.filter(function(x){ return x[7].trim().toUpperCase() === 'CREATED'; }).length;
    var dueSusp = s.filter(function(x){ return x[3].trim().toUpperCase() === 'YES' && x[4].trim().toUpperCase() === 'PENDING'; }).length;
    var dueReact = r.filter(function(x){ return x[3].trim().toUpperCase() === 'YES' && x[4].trim().toUpperCase() === 'PENDING'; }).length;
    var reviews = j.concat(s, r).filter(function(x) { return x.some(function(v) { return String(v).trim().toUpperCase() === 'REVIEW REQUIRED'; }); }).length;
    var p = PropertiesService.getScriptProperties();
    var pairs = [
      ['GWS Admin Hub — Operational Dashboard', 'Read-only summary (no live user edits)'],
      ['Workspace domain', c.domain],
      ['Approved joiners READY', ready],
      ['Joiners CREATED', created],
      ['Approved suspensions PENDING', dueSusp],
      ['Approved reactivations PENDING', dueReact],
      ['Rows needing review', reviews],
      ['Scheduled trigger owner', p.getProperty(HUB.PROP_TRIGGER_OWNER) || 'Not registered'],
      ['Last scheduled check', p.getProperty(HUB.PROP_LAST_RUN) || 'Not recorded'],
      ['Last scheduled check result', p.getProperty(HUB.PROP_LAST_STATUS) || 'Not recorded'],
      ['Dashboard refreshed', new Date()],
      ['2SV report', 'Run Refresh read-only 2SV summary to populate below'],
      ['License report', 'Manual aggregate only; use Refresh manual license snapshot. API integration not enabled.']
    ];
    tab.getRange(1, 1, pairs.length, 2).setValues(pairs);
    tab.getRange('A1:B1').setBackground('#17365d').setFontColor('#ffffff').setFontWeight('bold');
    tab.setColumnWidth(1, 310); tab.setColumnWidth(2, 520);
    tab.setFrozenRows(1);
    ss.toast('Operational dashboard refreshed. No accounts modified.', 'GWS Admin Hub', 5);
  } finally { lock.releaseLock(); }
}

// Read-only tenant summary. Counts are aggregated; never writes employee lists
// or individual 2SV statuses into the dashboard. Does NOT modify policies.
function hub_refreshSecuritySummary() {
  var c = hub_authorize_(), lock = hub_lock_();
  try {
    var ss = hub_sheet_(), tab = ss.getSheetByName(HUB.DASHBOARD);
    if (!tab) throw new Error('Run Refresh operational dashboard first.');
    var pageToken, total = 0, enrolled = 0, unenrolled = 0, unknown = 0, enforced = 0, active = 0, suspended = 0, pages = 0;
    do {
      var opts = { domain: c.domain, maxResults: 500, projection: 'basic', viewType: 'admin_view' };
      if (pageToken) opts.pageToken = pageToken;
      var response = AdminDirectory.Users.list(opts);
      (response.users || []).forEach(function(u) {
        if (!hub_isDomainEmail_(String(u.primaryEmail || '').toLowerCase(), c.domain)) return;
        total++;
        if (u.suspended) suspended++; else active++;
        if (u.isEnrolledIn2Sv === true) enrolled++;
        else if (u.isEnrolledIn2Sv === false) unenrolled++;
        else unknown++;
        if (u.isEnforcedIn2Sv === true) enforced++;
      });
      pageToken = response.nextPageToken;
      pages++;
      if (pages > 20 && pageToken) throw new Error('Report exceeds 10,000 users; use a paginated export workflow.');
    } while (pageToken);
    tab.getRange(15, 1, 7, 2).setValues([
      ['2SV summary refreshed', new Date()],
      ['Users in configured domain', total],
      ['2SV enrolled', enrolled],
      ['2SV not enrolled', unenrolled],
      ['2SV status unavailable', unknown],
      ['2SV enforced', enforced],
      ['Users active / suspended', active + ' / ' + suspended]
    ]);
    tab.getRange('A15:B15').setBackground('#137333').setFontColor('#ffffff').setFontWeight('bold');
    ss.toast('2SV aggregate report refreshed. No user accounts changed.', 'GWS Admin Hub', 5);
  } finally { lock.releaseLock(); }
}
