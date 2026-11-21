/**
 * Manual, read-only aggregate license snapshot.
 * No License Manager API access, user-level exports or licensing mutations.
 */
function hub_validateLicenseRows_(rows) {
  var result = [], seen = {};
  rows.forEach(function(r,i) {
    if (!r.slice(0,5).some(function(v) {return String(v).trim();})) return;
    var product = String(r[0] || '').trim(), sku = String(r[1] || '').trim();
    if (!product || !sku || !/^[a-zA-Z0-9_.-]{1,100}$/.test(sku)) {
      throw new Error('Invalid product/SKU at row '+(i+2));
    }
    if (seen[product+'::'+sku]) throw new Error('Duplicate product/SKU at row '+(i+2));
    seen[product+'::'+sku] = true;
    function nonnegativeCount(value,label) {
      var raw = String(value == null ? '' : value).trim();
      if (!raw) return null;
      if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
        throw new Error('Invalid '+label+' at row '+(i+2));
      }
      return Number(raw);
    }
    var assigned = nonnegativeCount(r[2],'assigned count');
    var purchased = nonnegativeCount(r[3],'purchased count');
    var source = String(r[4] || '').trim();
    if (assigned === null || !source || source.length > 120) {
      throw new Error('Assigned count and source are required at row '+(i+2));
    }
    var verified = String(r[5] || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(verified)) {
      throw new Error('Verified At must be YYYY-MM-DD at row '+(i+2));
    }
    var available = purchased === null ? 'UNKNOWN' : Math.max(0,purchased-assigned);
    var status = purchased !== null && assigned > purchased ? 'OVER-ASSIGNED / VERIFY' : 'MANUAL SNAPSHOT';
    result.push([
      hub_safeText_(product), sku, assigned,
      purchased === null ? 'UNKNOWN' : purchased, available,
      hub_safeText_(status+'; source: '+source+'; verified: '+verified),
      new Date()
    ]);
  });
  return result;
}
function hub_refreshLicenseSnapshot() {
  hub_authorize_();
  var lock = hub_lock_();
  try {
    var input = hub_getTab_(HUB.LICENSE_INPUT,['Product','SKU','Assigned','Purchased','Source','Verified At']);
    var output = hub_getTab_(HUB.LICENSE_SUMMARY,['Product','SKU','Assigned','Purchased','Available','Source','Updated At']);
    var rows = input.getLastRow() > 1
      ? input.getRange(2,1,input.getLastRow()-1,6).getDisplayValues() : [];
    var aggregates = hub_validateLicenseRows_(rows);
    if (output.getLastRow() > 1) output.getRange(2,1,output.getLastRow()-1,7).clearContent();
    if (aggregates.length) output.getRange(2,1,aggregates.length,7).setValues(aggregates);
    var dashboard = hub_sheet_().getSheetByName(HUB.DASHBOARD);
    if (dashboard) dashboard.getRange(13,1,1,2).setValues([[
      'License report',aggregates.length+' manual SKU snapshot(s); see LicenseSummary — not an API sync'
    ]]);
    hub_sheet_().toast(aggregates.length+' license snapshot(s) checked. No API calls or changes.','Licensing',6);
    return aggregates.length;
  } finally { lock.releaseLock(); }
}