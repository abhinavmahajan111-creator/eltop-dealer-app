// Single source of truth for the Sales dashboard's "coming soon" tiles —
// used by both SalesDashboard.jsx (the clickable grid) and ComingSoon.jsx
// (the placeholder screen each tile opens). Static/placeholder for now —
// per the 2 Sep 2026 scope decision (see project docs), these are just
// clickable stubs so the dashboard reads like a real, complete app to the
// Sales team; each gets built out for real, one at a time, later.

// Personal/HR-ish items every staff member gets, regardless of tier —
// modeled on UpTeams' module list (Attendance, Tasks, Leads, Reports,
// Leaves, Expenses, Forms).
const PERSONAL = [
  { slug: "attendance", icon: "🕒", title: "Attendance", description: "Your daily punch-in / punch-out record." },
  { slug: "tasks", icon: "✅", title: "Tasks", description: "Calls, follow-ups, and other tasks assigned to you." },
  { slug: "leads", icon: "🎣", title: "Leads", description: "New prospects, before they become a dealer/customer." },
  { slug: "reports", icon: "📊", title: "Reports", description: "Your performance, visits, and travel reports." },
  { slug: "leaves", icon: "🌴", title: "Leaves", description: "Apply for and track your leave requests." },
  { slug: "expenses", icon: "💵", title: "Expenses", description: "Submit and track your travel/field expenses." },
  { slug: "forms", icon: "📝", title: "Forms", description: "Field forms, like customer onboarding." },
];

// Individual rep's own performance — sales_associate and senior_sales_associate.
const OWN_WORK = [
  { slug: "territory-map", icon: "🗺️", title: "My Territory Map", description: "Visual map of your assigned counters and coverage area." },
  { slug: "targets", icon: "🎯", title: "My Targets & Achievement", description: "Your current targets and progress against them." },
  { slug: "commission", icon: "💰", title: "My Commission / Salary Statement", description: "Your commission and salary statements by period." },
];

// Senior Sales Associate — team oversight on top of their own work.
const TEAM_EXTRA = [
  { slug: "my-team", icon: "👥", title: "My Team", description: "Review your team's onboarding submissions, approve or reject them, and adjust territory assignments." },
];

// Senior Sales Executive — department-wide, not individual-quota driven.
const EXEC_EXTRA = [
  { slug: "team-performance", icon: "📈", title: "Team Performance", description: "Performance rollup across every Sales Associate and Senior Sales Associate." },
  { slug: "targets-strategy", icon: "🧭", title: "Targets & Strategy", description: "Set targets for the Sales team and push strategy/mission messaging down the ladder." },
];

export const FEATURES_BY_ROLE = {
  sales_associate: [...OWN_WORK, ...PERSONAL],
  senior_sales_associate: [...TEAM_EXTRA, ...OWN_WORK, ...PERSONAL],
  senior_sales_executive: [...EXEC_EXTRA, ...PERSONAL],
};

// Flat lookup by slug, for the ComingSoon placeholder screen.
export const FEATURE_CATALOG = Object.fromEntries(
  [...OWN_WORK, ...TEAM_EXTRA, ...EXEC_EXTRA, ...PERSONAL].map((f) => [f.slug, f])
);

export function featuresForRole(role) {
  return FEATURES_BY_ROLE[role] || OWN_WORK.concat(PERSONAL);
}
