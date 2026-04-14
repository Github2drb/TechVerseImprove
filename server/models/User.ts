import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  email: String,
  password: String,
  role: String,
});

export default mongoose.model("User", UserSchema);