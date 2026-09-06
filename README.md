# 💬 Mada (SecretChat)

> A modern, secure, and feature-rich real-time messaging application with AI companions, voice & video calling, and PWA capabilities. Built with **Next.js 16**, **Socket.io**, and **MongoDB**.

---

## ✨ Features

- ⚡ **Real-Time Messaging**: Instant message delivery and typing indicators powered by **Socket.io**.
- 🤖 **AI Assistant & Personas**: Integrated AI chatbot and reply suggestions powered by **OpenAI**.
- 📞 **Voice & Video Calls**: 1:1 crystal-clear audio and video calling powered by **ZegoCloud UIKit**.
- 🎙️ **Voice Messages**: Record and play audio messages with animated waveform visualization (**WaveSurfer.js**).
- 🔒 **Privacy & Security**:
  - **Chat Vault**: Lock conversations behind a secure custom passcode.
  - **Disappearing Messages**: Auto-delete messages after a configurable timer.
  - End-to-end user session management and password hashing via **bcryptjs**.
- 📎 **Rich Media & File Sharing**: Send photos, videos, voice notes, and large files with interactive link previews.
- 😃 **Reactions & Emoji Picker**: Express yourself with message reactions and full Twemoji support.
- 📱 **Progressive Web App (PWA)**: Installable on mobile and desktop devices with Web Push notifications.
- 🛡️ **Admin Dashboard**: Manage users, oversee system reports, analyze storage, and moderate content.
- 🌐 **Multi-Language (i18n)**: Native multilingual support including Arabic and English.

---

## 🛠️ Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router, Turbopack)
- **Real-Time Engine**: [Socket.io](https://socket.io/) (with custom HTTP server bridge)
- **Database**: [MongoDB](https://www.mongodb.com/) with [Mongoose ODM](https://mongoosejs.com/)
- **Authentication**: [NextAuth.js v5 (Auth.js)](https://authjs.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) & [Shadcn UI](https://ui.shadcn.com/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/)
- **Calling**: [@zegocloud/zego-uikit-prebuilt](https://www.zegocloud.com/)
- **Audio Visualization**: [wavesurfer.js](https://wavesurfer.xyz/)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20 or higher recommended)
- [MongoDB](https://www.mongodb.com/try/download/community) running locally or MongoDB Atlas connection URI

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/mada-chat.git
cd mada-chat
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Configure your core variables:

```env
DATABASE_URL=mongodb://127.0.0.1:27017/secret-chat
AUTH_SECRET=your-random-secret-key
NEXTAUTH_SECRET=your-random-secret-key
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
AUTH_URL=http://127.0.0.1:3000
```

*(Optional: configure OpenAI API Key, ZegoCloud keys, and OAuth providers as needed).*

### 3. Run Locally

```bash
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) in your browser.

---

## 🚢 Deployment

### Deploy to Railway

This project is pre-configured with `railway.toml`:

1. Push this repository to GitHub.
2. Create a new project on [Railway](https://railway.app/) and link your repository.
3. Add a **MongoDB Plugin** inside the project canvas.
4. Add the required environment variables (see [`.env.railway`](./.env.railway)).
5. Generate a public domain under **Settings ➔ Networking** and set `NEXT_PUBLIC_APP_URL` & `AUTH_URL`.

---

## 📜 License

This project is private and proprietary.
