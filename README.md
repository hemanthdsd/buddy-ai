# Buddy AI 🤖✨

Buddy AI is a powerful, privacy-focused, and local-first AI writing assistant for Windows. It acts as an invisible companion running in the background, ready to help you write, rewrite, and enhance your text anywhere on your computer.

Powered by [Ollama](https://ollama.com/), Buddy AI runs completely locally, meaning **zero cloud dependencies, no subscriptions, and 100% privacy**.

## 🌟 Key Features

- **System-Wide Quick Actions:** Highlight text in *any* application (browser, Word, Discord) and a floating Buddy ✨ icon will appear. Click it to open the Quick Panel and instantly improve your text.
- **Smart Text Replacement:** Once the AI generates the improved text, click **⇄ Replace**, and Buddy will automatically paste the result directly back into the application you were originally typing in.
- **Main Assistant Panel:** Press `Ctrl+Shift+E` from anywhere to open the full Assistant Panel for deeper tasks.
- **Vision / Screen Analysis:** Capture a screenshot directly from the Assistant Panel and ask questions about your screen using vision models.
- **Prompt Enhancer Mode:** Write a short, simple idea, and Buddy will expand it into a highly detailed, professional AI prompt.
- **Multiple Writing Modes:** Improve Text, Fix Grammar, Professional Tone, Make Shorter, Friendly Tone, Write Email, and Continue Writing.
- **Unobtrusive UX:** Frameless, glassmorphism UI that feels native to modern Windows without stealing your window focus.

## 🛠️ Technology Stack

- **Framework:** Electron
- **Frontend:** React + TypeScript + CSS Modules
- **Build Tool:** Vite + Electron-Vite
- **AI Engine:** Ollama (Local Models)

## 🚀 Getting Started

### 1. Prerequisites

You must have [Node.js](https://nodejs.org/) installed, as well as [Ollama](https://ollama.com/).

Once Ollama is installed, open your terminal and pull the default models:

```bash
# Pull the default text model (fast and lightweight)
ollama pull qwen2.5:3b

# Pull the vision model (for screen capture analysis)
ollama pull llava
```

*(Note: You can change the models at any time in Buddy's Settings panel).*

### 2. Installation

Clone the repository and install the dependencies:

```bash
git clone https://github.com/hemanthdsd/buddy-ai.git
cd buddy-ai
npm install
```

### 3. Running in Development

To start the app in development mode with hot-reloading:

```bash
npm run dev
```

Buddy AI will start in your system tray and will actively monitor for mouse selections and the global shortcut.

### 4. Building for Production

To package the application for distribution:

```bash
npm run build:win
```

## ⌨️ Shortcuts

- **`Ctrl+Shift+E`**: Toggle the Main Assistant Panel.
- **`ESC`**: Dismiss the Quick Panel or floating icon.

## 🔧 Architecture Notes

- **IPC Bridges:** Complex, secure IPC handlers manage communication between the React frontend and the Electron Node.js backend.
- **Mouse Monitor:** Uses a lightweight background PowerShell script to detect drag-and-drop text selections without relying on intrusive native keyloggers.
- **Non-focusable Windows:** The floating Quick Panels are designed to be explicitly non-focusable by the OS. This allows you to interact with the UI without stealing focus from your active browser or text editor, ensuring smooth `Ctrl+V` replacements.
