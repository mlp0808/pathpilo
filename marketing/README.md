# PathPilo Marketing Website

A standalone marketing website for PathPilo SaaS platform.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation
```bash
cd marketing
npm install
```

### Development
```bash
npm run dev
```
Open [http://localhost:3001](http://localhost:3001) in your browser.

### Production Build
```bash
npm run build
npm start
```

## 📁 Structure

```
marketing/
├── app/
│   ├── layout.tsx          # Root layout
│   ├── page.tsx           # Homepage
│   ├── pricing/
│   │   └── page.tsx       # Pricing page
│   └── globals.css        # Global styles
├── package.json
├── tailwind.config.js
├── next.config.js
├── tsconfig.json
└── README.md
```

## 🔗 Links to SaaS App

All links to the SaaS application use `https://app.pathpilo.com/` URLs:
- Login: `https://app.pathpilo.com/login`
- Register: `https://app.pathpilo.com/register`
- Dashboard: `https://app.pathpilo.com/dashboard`

## 🎨 Styling

- **Framework**: Tailwind CSS
- **Components**: Heroicons for icons
- **Layout**: Responsive design with mobile-first approach

## 🚀 Deployment

Deploy to Vercel, Netlify, or any static hosting service:

```bash
npm run build
# Deploy the .next folder
```

## 📝 Adding New Pages

1. Create new folder in `app/`
2. Add `page.tsx` file
3. Update navigation links as needed

Example:
```
app/
├── about/
│   └── page.tsx    # /about page
└── contact/
    └── page.tsx    # /contact page
```