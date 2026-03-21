# DRB TechVerse Dashboard - Design Guidelines

## Design Approach

**System-Based Approach**: Drawing from Material Design principles combined with modern dashboard patterns seen in Linear and Notion, optimized for team productivity and data visualization.

**Core Principle**: Clean, functional dashboard design prioritizing quick information access, task completion, and team collaboration.

---

## Typography

**Font Stack**: 
- Primary: Inter (via Google Fonts CDN)
- Monospace: JetBrains Mono (for metrics/data)

**Hierarchy**:
- Page Title: text-4xl font-bold (Dashboard headers)
- Section Headers: text-2xl font-semibold
- Card Titles: text-lg font-semibold
- Body Text: text-base font-normal
- Metadata/Labels: text-sm font-medium
- Captions: text-xs text-gray-600

---

## Layout System

**Spacing Primitives**: Use Tailwind units of **2, 4, 6, 8, 12** (e.g., p-4, gap-6, m-8)

**Grid Structure**:
- Main container: max-w-7xl mx-auto px-6
- Dashboard cards: grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6
- Content sections: space-y-8

**Navigation**:
- Sticky top header: h-16 with logo, search, user profile
- Breadcrumb navigation below header
- No sidebar - horizontal navigation pattern

---

## Component Library

### Dashboard Cards
- Rounded corners: rounded-xl
- Padding: p-6
- Shadow: shadow-sm with hover:shadow-md transition
- Border: border border-gray-200
- Structure: Icon (top-left) → Title → Description → Action link/button

### Status Badges
- Pill shape: rounded-full px-3 py-1
- Sizes: text-xs font-medium
- Types: Active, Coming Soon, In Progress, Completed

### Quick Stats Widgets
- Compact cards: 2x2 grid on desktop
- Large number display: text-3xl font-bold
- Label below: text-sm
- Icon indicator: 24x24 from Heroicons

### Project Tracker Cards
- Progress bar component with percentage
- Avatar stack showing assigned members (max 4 visible + counter)
- Timestamp: text-xs text-gray-500
- Status indicator dot

### Team Member Cards
- Avatar: 48x48 rounded-full
- Name: text-base font-semibold
- Role: text-sm text-gray-600
- Contact actions: Icon buttons (email, chat)

### Search Bar
- Prominent placement in header
- Width: w-96 on desktop, full-width on mobile
- Icon prefix: Heroicons search icon
- Placeholder: "Search projects, team members..."

---

## Page Structure

### Header Section (h-16)
- Logo (left): 32x32
- Search bar (center-left)
- Mode toggle + User avatar (right)

### Hero/Welcome Section
- Height: 200px (not full viewport)
- Gradient background treatment
- Welcome message: "Welcome back, [User]"
- Quick action buttons: "New Project", "View Reports"

### Main Dashboard Grid
**Row 1 - Stats Overview** (4 columns on lg):
- Total Projects
- Active Members  
- Completion Rate
- Recent Activity

**Row 2 - Primary Actions** (2 columns):
- Project Assignment (enhanced with preview)
- Team Excel Sheet (enhanced with last updated info)

**Row 3 - Coming Soon Placeholders** (2 columns):
- Analytics Dashboard preview
- Resource Library preview

### Team Section
- Title: "Team Members"
- Grid: 3-4 columns showing team cards
- Expandable to show all members

---

## Images

**No hero image required** - This is a utility dashboard focused on functionality.

**Avatar Images**: Team member photos (circular, 48x48 for cards, 32x32 for compact views)

**Icon Usage**: Heroicons throughout for consistency - use outline style for primary actions, solid for active states

---

## Interactions

**Hover States**:
- Cards: Lift effect (shadow elevation increase)
- Buttons: Subtle background change
- Links: Underline decoration

**Loading States**: Skeleton screens for dashboard cards while fetching data

**Empty States**: Friendly illustrations with action prompts for "Coming Soon" sections

---

## Responsive Behavior

**Mobile (base)**:
- Single column layout
- Collapsible search
- Stats grid: 2 columns
- Hamburger menu for secondary nav

**Tablet (md)**:
- 2 column card grid
- Visible search bar

**Desktop (lg)**:
- 4 column stats, 2-3 column cards
- Full navigation visible

---

## Accessibility

- Keyboard navigation for all interactive elements
- ARIA labels on icon-only buttons
- Focus rings: ring-2 ring-blue-500
- Sufficient contrast ratios (WCAG AA)
- Form inputs: Consistent 44px minimum touch targets