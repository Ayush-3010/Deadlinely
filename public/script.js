// DOM Event Listeners
document.getElementById("show-signin").addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById("signup-container").style.display = "none";
    document.getElementById("signin-container").style.display = "block";
});

document.getElementById("show-signup").addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById("signin-container").style.display = "none";
    document.getElementById("signup-container").style.display = "block";
});

// Auth Functions
async function signup() {
    const email = document.getElementById("signup-email").value;
    const password = document.getElementById("signup-password").value;

    const response = await fetch("http://localhost:3000/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
    });

    const data = await response.json();
    alert(data.msg);
    if (data.check) {
        document.getElementById("signup-container").style.display = "none";
        document.getElementById("signin-container").style.display = "block";
    }

    document.getElementById("signup-email").value = "";
    document.getElementById("signup-password").value = "";
}

async function signin() {
    const email = document.getElementById("signin-email").value;
    const password = document.getElementById("signin-password").value;

    const response = await fetch("http://localhost:3000/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
    });

    const data = await response.json();
    if (data.token) {
        localStorage.setItem("token", data.token);
        document.getElementById("signin-container").style.display = "none";
        document.getElementById("dashboard").style.display = "block";
        initializeDashboard();
    } else {
        alert(data.msg);
    }

    document.getElementById("signin-email").value = "";
    document.getElementById("signin-password").value = "";
}

function logout() {
    localStorage.removeItem("token");
    document.getElementById("dashboard").style.display = "none";
    document.getElementById("signup-container").style.display = "block";
    document.getElementById("todo-list").innerHTML = "";
}

// Dashboard Initialization
async function initializeDashboard() {
    await getAITasks('smart');
    await getProductivityInsights();
    await generateDailyPlan();
}

// Task Management
async function addtodo() {
    const title = document.getElementById("todo-input").value;
    const priority = parseInt(document.getElementById("priority-input").value) || 3;
    const deadline = document.getElementById("deadline-input").value;
    const estimatedTime = parseInt(document.getElementById("time-input").value) || null;

    if (!title) {
        alert("Please enter a task description");
        return;
    }

    try {
        const response = await fetch("http://localhost:3000/todo", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                token: localStorage.getItem("token")
            },
            body: JSON.stringify({
                title,
                done: false,
                priority,
                deadline: deadline ? new Date(deadline) : null,
                estimatedTime
            })
        });

        await response.json();
        await getAITasks('smart');

        document.getElementById("todo-input").value = "";
        document.getElementById("priority-input").value = "3";
        document.getElementById("deadline-input").value = "";
        document.getElementById("time-input").value = "";
    } catch (error) {
        console.error("Error adding todo:", error);
        alert("Failed to add task");
    }
}

async function getAITasks(sortMethod = 'smart') {
    try {
        const response = await fetch(`http://localhost:3000/ai/tasks?sort=${sortMethod}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                token: localStorage.getItem("token")
            }
        });

        const tasks = await response.json();
        renderTasks(tasks);
    } catch (error) {
        console.error("Error getting tasks:", error);
    }
}

function renderTasks(tasks) {
    const todoList = document.getElementById("todo-list");
    todoList.innerHTML = "";

    if (!tasks.length) {
        todoList.innerHTML = "<li>No tasks found. Add some tasks to get started!</li>";
        return;
    }

    tasks.forEach(task => {
        const li = document.createElement("li");
        li.classList.add("todo-items", `priority-${task.priority}`);

        const deadlineInfo = task.deadline ? `<div class="task-deadline">⏰ ${formatDate(new Date(task.deadline))}</div>` : '';
        const timeInfo = task.estimatedTime ? `<div class="task-time">⏱ ${task.estimatedTime} min</div>` : '';

        li.innerHTML = `
            <div class="task-content">
                <div class="task-title">${task.title}</div>
                <div class="task-meta">
                    ${deadlineInfo}
                    ${timeInfo}
                    <div class="task-priority">${getPriorityStars(task.priority)}</div>
                </div>
            </div>
            <div class="task-actions">
                <button class="complete-btn" data-id="${task._id}">✓ Complete</button>
                <button class="delete-btn" data-id="${task._id}">✕ Delete</button>
            </div>
        `;
        todoList.appendChild(li);
    });

    document.querySelectorAll('.complete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const taskId = e.target.getAttribute('data-id');
            await markTaskComplete(taskId);
        });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const taskId = e.target.getAttribute('data-id');
            await deleteTask(taskId);
        });
    });
}

function getPriorityStars(priority) {
    return '⭐'.repeat(priority) + '☆'.repeat(5 - priority);
}

function formatDate(date) {
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function markTaskComplete(taskId) {
    try {
        await fetch(`http://localhost:3000/todo/${taskId}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                token: localStorage.getItem("token")
            },
            body: JSON.stringify({ done: true })
        });

        await getAITasks('smart');
        await getProductivityInsights();
    } catch (error) {
        console.error("Error marking task complete:", error);
    }
}

async function deleteTask(taskId) {
    try {
        await fetch(`http://localhost:3000/todo/${taskId}`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                token: localStorage.getItem("token")
            }
        });

        await getAITasks('smart');
    } catch (error) {
        console.error("Error deleting task:", error);
    }
}

// Productivity Insights
async function getProductivityInsights() {
    try {
        const response = await fetch("http://localhost:3000/ai/insights", {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                token: localStorage.getItem("token")
            }
        });

        const insights = await response.json();
        renderProductivityStats(insights);
        renderAISuggestions(insights);
    } catch (error) {
        console.error("Error getting insights:", error);
    }
}

function renderProductivityStats(insights) {
    const statsContainer = document.getElementById("stats-container");
    statsContainer.innerHTML = `
        <div class="stat-item"><div class="stat-value">${insights.tasksCompleted || 0}</div><div class="stat-label">Tasks Done</div></div>
        <div class="stat-item"><div class="stat-value">${insights.avgPriority || 0}</div><div class="stat-label">Avg Priority</div></div>
        <div class="stat-item"><div class="stat-value">${insights.efficiency || 0}%</div><div class="stat-label">Efficiency</div></div>
    `;
}

function renderAISuggestions(insights) {
    const suggestionsContainer = document.getElementById("ai-suggestions");
    suggestionsContainer.innerHTML = '<h4>AI Suggestions</h4>';

    const suggestions = [];

    if (insights.efficiency < 0) {
        suggestions.push("You consistently underestimate time. Try adding 10 more minutes next time.");
    } else if (insights.efficiency > 20) {
        suggestions.push("Great job finishing tasks early!");
    }

    if (insights.tasksCompleted > 3) {
        suggestions.push("Consider taking a 5-minute break every 50 minutes.");
    }

    if (insights.avgPriority < 2.5) {
        suggestions.push("You're focusing on low-priority tasks. Try tackling high-priority items first.");
    }

    if (suggestions.length === 0) {
        suggestions.push("You're doing great! Keep up the good work.");
    }

    suggestions.forEach(suggestion => {
        const suggestionEl = document.createElement("div");
        suggestionEl.className = "ai-suggestion";
        suggestionEl.textContent = suggestion;
        suggestionsContainer.appendChild(suggestionEl);
    });
}

// AI Integration
async function generateDailyPlan() {
    const prompt = document.getElementById("daily-plan-input").value || "Plan my optimal day";
    const loadingIndicator = document.getElementById("daily-plan-output");
    loadingIndicator.innerHTML = "<div class='ai-suggestion'>Generating your plan... ⏳</div>";

    try {
        const tasksResponse = await fetch("http://localhost:3000/ai/tasks?sort=smart", {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                token: localStorage.getItem("token")
            }
        });
        const tasks = await tasksResponse.json();

        if (tasks.length === 0) {
            loadingIndicator.innerHTML = `
                <div class="ai-suggestion">
                    No tasks found. Add some tasks first to generate a plan.
                </div>`;
            return;
        }

        const aiResponse = await fetch("http://localhost:3000/ai/process", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                token: localStorage.getItem("token")
            },
            body: JSON.stringify({
                prompt,
                existingTodos: tasks
            })
        });

        const result = await aiResponse.json();

        if (result.error) {
            loadingIndicator.innerHTML = `
                <div class="ai-suggestion" style="color: #ff6b6b;">
                    ${result.error}<br>
                    <button onclick="generateDailyPlan()">Try Again</button>
                </div>`;
        } else {
            loadingIndicator.innerHTML = `
                <div class="ai-suggestion">
                    <strong>Your Optimized Daily Plan:</strong>
                    <div style="margin-top: 10px; white-space: pre-line;">
                        ${formatSchedule(result.schedule)}
                    </div>
                    <button onclick="generateDailyPlan()">Regenerate</button>
                </div>`;
        }
    } catch (error) {
        console.error("Error:", error);
        loadingIndicator.innerHTML = `
            <div class="ai-suggestion" style="color: #ff6b6b;">
                Failed to generate plan: ${error.message}<br>
                <button onclick="generateDailyPlan()">Try Again</button>
            </div>`;
    }
}

function formatSchedule(scheduleText) {
    return scheduleText
        .replace(/(\d+:\d+ [AP]M)/g, '<strong>$1</strong>')
        .replace(/(\d+ min)/g, '<em>($1)</em>')
        .replace(/\n/g, '<br>');
}

if (localStorage.getItem("token")) {
    document.getElementById("signup-container").style.display = "none";
    document.getElementById("signin-container").style.display = "none";
    document.getElementById("dashboard").style.display = "block";
    initializeDashboard();
} else {
    document.getElementById("signup-container").style.display = "block";
    document.getElementById("signin-container").style.display = "none";
    document.getElementById("dashboard").style.display = "none";
}
