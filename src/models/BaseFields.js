import mongoose from 'mongoose';

export const baseFields = {
  active: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: Date,
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
};

export function toJSON(schema) {
  schema.set('toJSON', { virtuals: true, versionKey: false, transform: (_doc, ret) => { ret.id = ret._id.toString(); return ret; } });
  schema.set('toObject', { virtuals: true, versionKey: false });
}
