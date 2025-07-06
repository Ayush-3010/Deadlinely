const express = require("express");
const { UserModel, TodoModel } = require("./db");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const { z } = require("zod");
const cors = require("cors");
const { OpenAI } = require("openai");
require("dotenv").config();

mongoose.connect(process.env.MONGO_URL);

const app = express();
const JWT_KEY = process.env.JWT_KEY;
const openai = new OpenAI({ apiKey: process.env.OPEN_API_KEY });

app.use(express.json());
app.use(cors());

function auth(req, res, next) {
    const token = req.headers.token;
    if (!token) return res.status(401).json({ msg: "No token provided" });

    try {
        const decoded = jwt.verify(token, JWT_KEY);
        req.id = decoded.id;
        next();
    } catch (error) {
        res.status(403).json({ msg: "Invalid token" });
    }
}

app.post("/signup", async function (req, res) {
    const requiredBody = z.object({
        email: z.string().min(3).max(100).email(),
        password: z.string().min(5).max(30),
    });

    const parsedData = requiredBody.safeParse(req.body);
    if (!parsedData.success) {
        return res.status(400).json({ msg: "Incorrect format", error: parsedData.error });
    }

    const { email, password } = parsedData.data;
    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
        return res.json({ msg: "Email already exists. Please sign in or use a different email.", check: false });
    }

    const hashedPassword = await bcrypt.hash(password, 5);
    await UserModel.create({ email, password: hashedPassword });
    res.json({ msg: "You are signed up", check: true });
});

app.post("/signin", async function (req, res) {
    const { email, password } = req.body;
    const user = await UserModel.findOne({ email });

    if (!user) return res.status(403).json({ msg: "User does not exist" });

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) return res.status(403).json({ msg: "Incorrect email or password" });

    const token = jwt.sign({ id: user._id }, JWT_KEY);
    res.json({ token, msg: "You are successfully signed in" });
});

app.post("/todo", auth, async function (req, res) {
    try {
        const newTodo = await TodoModel.create({
            title: req.body.title,
            done: req.body.done || false,
            priority: req.body.priority || 3,
            deadline: req.body.deadline,
            estimatedTime: req.body.estimatedTime,
            userId: req.id
        });
        res.json(newTodo);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/todo", auth, async function (req, res) {
    try {
        const todos = await TodoModel.find({ userId: req.id });
        res.json(todos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put("/todo/:id", auth, async function (req, res) {
    try {
        const todo = await TodoModel.findOneAndUpdate(
            { _id: req.params.id, userId: req.id },
            req.body,
            { new: true }
        );
        if (!todo) return res.status(404).json({ msg: "Todo not found" });
        res.json(todo);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete("/todo/:id", auth, async function (req, res) {
    try {
        const todo = await TodoModel.findOneAndDelete({ _id: req.params.id, userId: req.id });
        if (!todo) return res.status(404).json({ msg: "Todo not found" });
        res.json({ msg: "Todo deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/ai/tasks", auth, async function (req, res) {
    try {
        const sortMethod = req.query.sort || 'smart';
        let todos = await TodoModel.find({ userId: req.id, done: false });

        if (sortMethod === 'priority') {
            todos.sort((a, b) => b.priority - a.priority);
        } else if (sortMethod === 'deadline') {
            todos.sort((a, b) => new Date(a.deadline || 0) - new Date(b.deadline || 0));
        } else {
            const now = new Date();
            todos.sort((a, b) => {
                const aScore = (a.priority * 2) + (a.deadline ? (100000000 / (new Date(a.deadline) - now)) : 0) + (a.estimatedTime ? (1 / a.estimatedTime) : 0);
                const bScore = (b.priority * 2) + (b.deadline ? (100000000 / (new Date(b.deadline) - now)) : 0) + (b.estimatedTime ? (1 / b.estimatedTime) : 0);
                return bScore - aScore;
            });
        }

        res.json(todos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/ai/insights", auth, async function (req, res) {
    try {
        const todos = await TodoModel.find({ userId: req.id });
        const completedTodos = todos.filter(todo => todo.done);

        let totalEstimated = 0;
        let totalActual = 0;
        completedTodos.forEach(todo => {
            totalEstimated += todo.estimatedTime || 0;
            totalActual += todo.actualTime || (todo.estimatedTime || 0);
        });

        const efficiency = totalEstimated > 0 ? ((totalEstimated - totalActual) / totalEstimated) * 100 : 0;
        const avgPriority = completedTodos.length > 0 ? completedTodos.reduce((sum, todo) => sum + todo.priority, 0) / completedTodos.length : 0;

        res.json({
            tasksCompleted: completedTodos.length,
            efficiency: parseFloat(efficiency.toFixed(2)),
            avgPriority: parseFloat(avgPriority.toFixed(2))
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/ai/process", auth, async function(req, res) {
    const { prompt, existingTodos = [] } = req.body;

    try {
        const todos = existingTodos.length > 0
            ? existingTodos
            : await TodoModel.find({ userId: req.id, done: false });

        const formattedPrompt = `
You are a helpful planner. Create a student's daily schedule with NO overlapping tasks.
Tasks:
${todos.map(t => `- ${t.title} (${t.estimatedTime || 30} min)`).join('\n')}
Only schedule tasks between 08:00 and 22:00. Format each line like this:
HH:MM - HH:MM | Task

Extra: ${prompt || "Make realistic and efficient."}
`;

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: "You are a smart planner." },
                { role: "user", content: formattedPrompt }
            ],
            temperature: 0.4,
            max_tokens: 700,
        });

        const schedule = completion.choices[0]?.message?.content || "";
        const parsed = parseSchedule(schedule);

        if (hasConflicts(parsed)) {
            return res.status(400).json({ error: "Overlapping tasks detected. Try again with clearer time constraints." });
        }

        res.json({ schedule });

    } catch (error) {
        console.error("AI Processing Error:", error);
        res.status(500).json({ error: "AI failed to generate plan", details: error.message });
    }
});

function parseSchedule(text) {
    const lines = text.split('\n').filter(line => line.includes('|'));
    return lines.map(line => {
        const [timePart, taskPart] = line.split('|').map(s => s.trim());
        const [startTime, endTime] = timePart.split('-').map(s => s.trim());
        return { startTime, endTime, task: taskPart };
    });
}

function hasConflicts(schedule) {
    for (let i = 1; i < schedule.length; i++) {
        const prevEnd = new Date(`2000-01-01T${schedule[i - 1].endTime}:00`);
        const currStart = new Date(`2000-01-01T${schedule[i].startTime}:00`);
        if (currStart < prevEnd) return true;
    }
    return false;
}

app.listen(3000, () => console.log("Server running on port 3000"));
