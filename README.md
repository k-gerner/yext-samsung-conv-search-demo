# Yext Conversational Search Demo - Samsung

Demo app that connects to the Yext Conversational Search endpoint with a React ChatKit UI.


## What’s In This Repo
- **Frontend**: React + `@openai/chatkit-react` with a references panel and UI controls
  for color scheme, radius, density, and chat width.

## Project Structure

```
chat-kit-testing/
  ├── src/
  │   ├── App.tsx           # ChatKit React integration + references panel
  |   ├── chatkitApi.ts     # for interacting with Yext API
  │   ├── main.tsx
  │   └── index.css
  ├── package.json
  └── .env.example
```

## Prerequisites

- Node.js 18.18+
- npm 9+
- OpenAI API key (required for the Agents + FileSearchTool flow)

## Frontend Setup

1. `npm install`
2. `cp .env.example .env` (copies example secrets into your .env)
3. update `VITE_SEARCH_API_URL` to your non-local URL parth (if not running backend servers locally), e.g. `https://prod-cdn.us.yextapis.com/v2/accounts/me/search/conversation/query`
4. update `VITE_SEARCH_EXPERIENCE_KEY` (experience key), `VITE_SEARCH_VERSION` (staging vs production), and `VITE_SEARCH_API_KEY` (search api key)
5. `npm run dev` and it should be running at `http://localhost:5045/`


The app runs at `http://localhost:5045`.


## Tech Stack

**Frontend**
- React 19
- TypeScript
- @openai/chatkit-react
- Vite
- Tailwind CSS
