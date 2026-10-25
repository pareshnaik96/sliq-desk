import mongoose from 'mongoose';

// _id is "ticket:<orgId>"; seq is incremented atomically with $inc.
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { versionKey: false },
);

export const Counter = mongoose.model('Counter', counterSchema);
