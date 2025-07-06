const mongoose = require('mongoose');

const todoSchema = new mongoose.Schema({
  title: String,
  done: Boolean,
  userId: mongoose.Schema.Types.ObjectId,
  createdAt: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
  email: String,
  password: String
});

const UserModel = mongoose.model('User', userSchema);
const TodoModel = mongoose.model('Todo', todoSchema);

module.exports = { UserModel, TodoModel };
