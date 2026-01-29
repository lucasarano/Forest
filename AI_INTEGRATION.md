# AI Integration Guide - Learning Tree

## Overview

The Learning Tree now features AI-powered selective branching that creates an intelligent, context-aware knowledge graph. Each node can ask questions to an AI tutor that understands the full learning path.

## Setup

### 1. Get OpenAI API Key

1. Go to [https://platform.openai.com](https://platform.openai.com)
2. Sign up or log in
3. Navigate to API Keys
4. Create a new secret key
5. Copy the key (starts with `sk-`)

### 2. Configure Environment

Add to your `.env` file:

```env
VITE_OPENAI_API_KEY=sk-your-actual-key-here
```

**Important**: Never commit your `.env` file (it's already in `.gitignore`)

### 3. Install Dependencies

Dependencies are already installed:
- `react-markdown` - Renders AI responses
- `remark-gfm` - GitHub Flavored Markdown support

## How It Works

### Architecture

```
User Question
    ↓
Build Context Path (node → root)
    ↓
Format Contextual Heritage
    ↓
Send to OpenAI with specialized system prompt
    ↓
Parse Response + Expansion Ideas
    ↓
Display in StudyCard
    ↓
User selects text → Creates child node with context
```

### Context Inheritance

When you ask a question at any node, the AI receives:

1. **Root Topic**: The starting point of your learning
2. **Full Path**: Every branch point and question asked
3. **Context Anchors**: Specific text selections that created branches
4. **Current Question**: Your new question

Example heritage string:
```
Contextual Heritage:
Root Topic: "React Basics" (Original question: "What is React?")
  ↳ Level 1: "Virtual DOM" (branched from: "uses a virtual DOM")
  ↳ Level 2: "Reconciliation" (branched from: "reconciliation algorithm")

Current Question: How does diffing work?
```

### Features

#### 1. Contextual Q&A
- Click any node → Opens StudyCard on the right
- Ask questions → AI responds with full, comprehensive answers
- No word limits - AI gives complete explanations
- Markdown formatted with code examples, lists, etc.

#### 2. Selective Branching (User-Driven Only)
- Read AI response
- Select any text you want to understand better
- "Branch from this" button appears
- Click → Creates child node with:
  - Selected text as label and context anchor
  - Automatic AI explanation focused on that specific concept
  - No automatic suggestions - you control the learning path

#### 3. Visual Path Highlighting
- Selected node shows its **full path to root** in golden color
- Normal edges are emerald
- Active path edges glow amber
- Particles travel along active paths


## Usage Examples

### Example 1: Learning React

1. **Create root node** (double-click canvas)
2. **Click node** → StudyCard opens
3. **Ask**: "What is React?"
4. **AI responds** with explanation
5. **Select text**: "virtual DOM"
6. **Click "Branch from this"**
7. **Child node created** with AI explanation of Virtual DOM
8. **Parent now shows** "virtual DOM" highlighted

### Example 2: Deep Dive

1. From previous example, click Virtual DOM node
2. Ask: "How does reconciliation work?"
3. AI responds with full explanation (doesn't repeat basics from parent)
4. Select text: "Fiber architecture"
5. Click "Branch from this"
6. New child created with focused explanation of Fiber

## System Prompt

The AI uses this specialized prompt:

> "You are a specialized Knowledge Graph Tutor. You receive a 'Contextual Heritage' string showing the learning path. Answer the question thoroughly and completely while maintaining continuity - don't repeat established facts. Provide complete, comprehensive answers. Format in Markdown with headings, lists, and code examples where appropriate. If the student asks about a specific concept they selected, dive deep into just that concept."

This ensures:
- No repetition of concepts already covered
- Complete, thorough explanations (no artificial limits)
- Focused answers based on what was selected
- Learning flow continuity
- Student-driven exploration (no forced suggestions)

## Data Structure

### Enhanced Node Schema

```javascript
{
  id: string,
  label: string,
  position: { x, y },
  parentId: string | null,
  
  // AI Fields
  question: string,              // User's question
  aiResponse: string,            // Markdown response
  contextAnchor: string,         // Text that created this branch
  isExpanded: boolean,           // StudyCard visible
  highlights: [{                 // Branch anchors
    text: string,
    childId: string
  }]
}
```

### Persistence

All data is saved to `localStorage` automatically:
- Nodes with full AI responses
- Edges and visual structure
- Camera position
- Survives page refresh

Key: `forest-learning-tree`

## Controls

| Action | Result |
|--------|--------|
| Double-click canvas | Create root node |
| Click node | Open StudyCard / toggle menu |
| Type question + Enter | Ask AI |
| Select text in response | Show "Branch" button |
| Click "Branch" | Create child with context |
| Drag node | Move (children follow via edges) |
| Scroll | Zoom (aggressive, centered on cursor) |
| Click & drag canvas | Pan around |

## Performance

- Responses cached in node data
- Text selection debounced (100ms)
- Context path memoized
- localStorage auto-saves on changes

## Costs

OpenAI API charges per token:
- GPT-4o-mini: ~$0.15 per 1M tokens (very cheap)
- Average question: ~1000-2000 tokens (comprehensive answers)
- Cost per question: ~$0.00015-$0.0003

Settings:
- Max tokens: 1000 (allows thorough explanations)
- Temperature: 0.7 (balanced creativity)
- System prompt is concise

## Troubleshooting

### "API key not configured"
- Check `.env` file has `VITE_OPENAI_API_KEY=sk-...`
- Restart dev server after adding key
- Key must start with `sk-`

### Responses are generic
- Ensure context path is building correctly
- Check node has `question` and `contextAnchor` fields
- Verify heritage string in console logs

### Branch button doesn't appear
- Text must be selected in StudyCard content area
- Selection must be > 0 characters after trim
- Make sure you're selecting within the AI response text

### Responses are too short
- Responses are no longer limited - you should get comprehensive answers
- If still short, check the question is specific enough
- AI focuses on what you selected if branching from text

## Future Enhancements

- **Streaming responses**: Real-time AI answers
- **Multiple AI providers**: Switch between models
- **Voice input**: Ask questions by speaking
- **Export graph**: Save as JSON/PDF
- **Collaborative trees**: Share with others
- **Node types**: Different icons for different concepts
- **Smart positioning**: Auto-layout algorithm
- **Search**: Find concepts across tree
