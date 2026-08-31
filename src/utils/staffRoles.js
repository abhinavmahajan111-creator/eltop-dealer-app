// Single source of truth for staff role → department/label/dashboard-route
// mapping. Used by Login.jsx (post-login routing), StaffHome.jsx, the
// AdminStaff screen (role picker), and the *Route guards (redirect target
// when a staff member lands on a route that isn't theirs).
//
// Departments without a built dashboard yet (HR/Legal/Admin/Operations/Delhi
// Head) all point at the generic "/staff" placeholder — adding their real
// panel later just means changing one path here, not touching routing logic.
export const STAFF_ROLE_META = {
  sales_associate:        { department: "Sales",       label: "Sales Associate",        path: "/staff/sales" },
  senior_sales_associate: { department: "Sales",       label: "Senior Sales Associate", path: "/staff/sales" },
  senior_sales_executive: { department: "Sales",       label: "Senior Sales Executive", path: "/staff/sales" },

  after_sales_head:       { department: "After-Sales", label: "After-Sales Head",       path: "/staff/after-sales" },

  dispatch:               { department: "Logistics",   label: "Dispatch",               path: "/staff/dispatch" },
  logistics_coordinator:  { department: "Logistics",   label: "Logistics Coordinator",  path: "/staff/logistics" },

  back_office:            { department: "Back Office", label: "Back Office",            path: "/staff/back-office" },
  calling_support:        { department: "Back Office", label: "Calling / Support",      path: "/staff/support-desk" },

  content_marketing:      { department: "Content",     label: "Content & Marketing",    path: "/staff/content" },

  hr:                     { department: "HR",          label: "HR",                     path: "/staff" },
  legal:                  { department: "Legal",       label: "Legal",                  path: "/staff" },
  office_admin:           { department: "Admin",       label: "Admin",                  path: "/staff" },
  operations:             { department: "Operations",  label: "Operations",             path: "/staff" },
  delhi_head:             { department: "Delhi Head",  label: "Delhi Head",             path: "/staff" },
};

export function staffRolePath(role) {
  return STAFF_ROLE_META[role]?.path || "/staff";
}

export function staffRoleLabel(role) {
  return STAFF_ROLE_META[role]?.label || role || "Staff";
}

export function staffRoleDepartment(role) {
  return STAFF_ROLE_META[role]?.department || "";
}
