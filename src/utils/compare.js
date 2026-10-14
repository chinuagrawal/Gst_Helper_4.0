const REQUIRED_TOP_KEYS = ["gstin", "fp", "b2cs", "doc_issue", "supeco", "hsn"];
const DOC_FIELDS = ["num", "from", "to", "totnum", "cancel", "net_issue"];
const B2CS_FIELDS = [
  "sply_ty",
  "rt",
  "typ",
  "pos",
  "txval",
  "iamt",
  "samt",
  "camt",
  "csamt",
];
const HSN_FIELDS = [
  "num",
  "hsn_sc",
  "uqc",
  "qty",
  "rt",
  "txval",
  "iamt",
  "samt",
  "camt",
  "csamt",
];
const SUPECO_FIELDS = [
  "etin",
  "suppval",
  "igst",
  "cgst",
  "sgst",
  "cess",
  "flag",
];

function eq(a, b) {
  return a === b;
}

export function validateOutputStructure(output) {
  const issues = [];
  if (!output || typeof output !== "object") {
    return [{ path: "$", message: "Output is missing" }];
  }
  REQUIRED_TOP_KEYS.forEach((k) => {
    if (!(k in output) || output[k] == null) {
      issues.push({ path: k, message: `Missing required section "${k}"` });
    }
  });
  if (!Array.isArray(output.b2cs)) {
    issues.push({ path: "b2cs", message: "b2cs must be an array" });
  }
  const det = output.doc_issue?.doc_det;
  if (!Array.isArray(det) || det.length === 0) {
    issues.push({
      path: "doc_issue.doc_det",
      message: "doc_issue.doc_det must be a non-empty array",
    });
  } else {
    det.forEach((doc, i) => {
      if (doc.doc_num == null) {
        issues.push({
          path: `doc_issue.doc_det[${i}].doc_num`,
          message: "Missing doc_num",
        });
      }
      if (!doc.doc_typ) {
        issues.push({
          path: `doc_issue.doc_det[${i}].doc_typ`,
          message: "Missing doc_typ",
        });
      }
      if (!Array.isArray(doc.docs) || !doc.docs[0]) {
        issues.push({
          path: `doc_issue.doc_det[${i}].docs`,
          message: "Missing docs[0]",
        });
      } else {
        DOC_FIELDS.forEach((f) => {
          if (doc.docs[0][f] == null) {
            issues.push({
              path: `doc_issue.doc_det[${i}].docs[0].${f}`,
              message: `Missing ${f}`,
            });
          }
        });
      }
    });
  }
  if (!Array.isArray(output.supeco?.clttx)) {
    issues.push({ path: "supeco.clttx", message: "supeco.clttx must be an array" });
  }
  if (!Array.isArray(output.hsn?.hsn_b2c)) {
    issues.push({ path: "hsn.hsn_b2c", message: "hsn.hsn_b2c must be an array" });
  }
  return issues;
}

function pushFieldDiffs(diffs, path, ours, refs, fields) {
  fields.forEach((f) => {
    if (!eq(ours?.[f], refs?.[f])) {
      diffs.push({
        path: `${path}.${f}`,
        ours: ours?.[f],
        ref: refs?.[f],
      });
    }
  });
}

export function compareToReference(output, ref) {
  const diffs = [];
  const structure = validateOutputStructure(output);
  if (!ref || typeof ref !== "object") {
    return {
      ok: false,
      hasReference: false,
      structure,
      diffs: [{ path: "$", ours: null, ref: null, message: "No reference JSON" }],
    };
  }

  ["gstin", "fp"].forEach((k) => {
    if (!eq(output?.[k], ref[k])) {
      diffs.push({ path: k, ours: output?.[k], ref: ref[k] });
    }
  });

  const outB2cs = output?.b2cs || [];
  const refB2cs = ref.b2cs || [];
  if (outB2cs.length !== refB2cs.length) {
    diffs.push({
      path: "b2cs.length",
      ours: outB2cs.length,
      ref: refB2cs.length,
    });
  }
  refB2cs.forEach((rb) => {
    const ob = outB2cs.find((x) => eq(x.pos, rb.pos) && eq(x.rt, rb.rt));
    const key = `b2cs[pos=${rb.pos},rt=${rb.rt}]`;
    if (!ob) {
      diffs.push({ path: key, ours: null, ref: rb });
      return;
    }
    pushFieldDiffs(diffs, key, ob, rb, B2CS_FIELDS);
  });
  outB2cs.forEach((ob) => {
    const rb = refB2cs.find((x) => eq(x.pos, ob.pos) && eq(x.rt, ob.rt));
    if (!rb) {
      diffs.push({
        path: `b2cs[pos=${ob.pos},rt=${ob.rt}]`,
        ours: ob,
        ref: null,
      });
    }
  });

  const outDet = output?.doc_issue?.doc_det || [];
  const refDet = ref.doc_issue?.doc_det || [];
  if (!ref.doc_issue) {
    diffs.push({ path: "doc_issue", ours: output?.doc_issue, ref: null });
  }
  if (outDet.length !== refDet.length) {
    diffs.push({
      path: "doc_issue.doc_det.length",
      ours: outDet.length,
      ref: refDet.length,
    });
  }
  refDet.forEach((rd) => {
    const od = outDet.find((x) => eq(x.doc_num, rd.doc_num));
    const key = `doc_issue.doc_det[doc_num=${rd.doc_num}]`;
    if (!od) {
      diffs.push({ path: key, ours: null, ref: rd });
      return;
    }
    if (!eq(od.doc_typ, rd.doc_typ)) {
      diffs.push({ path: `${key}.doc_typ`, ours: od.doc_typ, ref: rd.doc_typ });
    }
    if (od.docs?.length !== rd.docs?.length) {
      diffs.push({ path: `${key}.docs.length`, ours: od.docs?.length, ref: rd.docs?.length });
    }
    (rd.docs || []).forEach((doc, i) =>
      pushFieldDiffs(diffs, `${key}.docs[${i}]`, od.docs?.[i], doc, DOC_FIELDS));
  });

  const outCl = output?.supeco?.clttx?.[0];
  const refCl = ref.supeco?.clttx?.[0];
  pushFieldDiffs(diffs, "supeco.clttx[0]", outCl, refCl, SUPECO_FIELDS);
  const outEco = output?.supeco?.clttx || [];
  const refEco = ref.supeco?.clttx || [];
  if (outEco.length !== refEco.length) {
    diffs.push({ path: 'supeco.clttx.length', ours: outEco.length, ref: refEco.length });
  }
  refEco.slice(1).forEach((row, i) =>
    pushFieldDiffs(diffs, `supeco.clttx[${i + 1}]`, outEco[i + 1], row, SUPECO_FIELDS));

  const outHsn = output?.hsn?.hsn_b2c || [];
  const refHsn = ref.hsn?.hsn_b2c || [];
  if (outHsn.length !== refHsn.length) {
    diffs.push({
      path: "hsn.hsn_b2c.length",
      ours: outHsn.length,
      ref: refHsn.length,
    });
  }
  refHsn.forEach((rh) => {
    const oh = outHsn.find(
      (x) => eq(x.hsn_sc, rh.hsn_sc) && eq(x.rt, rh.rt) && eq(x.uqc, rh.uqc),
    );
    const key = `hsn.hsn_b2c[hsn=${rh.hsn_sc},rt=${rh.rt},uqc=${rh.uqc}]`;
    if (!oh) {
      diffs.push({ path: key, ours: null, ref: rh });
      return;
    }
    pushFieldDiffs(diffs, key, oh, rh, HSN_FIELDS);
  });

  return {
    ok: diffs.length === 0 && structure.length === 0,
    hasReference: true,
    structure,
    diffs,
    blockingDiffs: diffs,
  };
}

export function canDownloadOutput(output, comparison) {
  const structure = validateOutputStructure(output);
  if (structure.length) return { allowed: false, structure, comparison };
  if (comparison && !comparison.ok) {
    return { allowed: false, structure, comparison };
  }
  return { allowed: true, structure, comparison };
}
