export function softDelete(doc, userId) {
  doc.isDeleted = true;
  doc.deletedAt = new Date();
  doc.deletedBy = userId;
  doc.active = false;
  return doc.save();
}
