// Navigation System Exports for Satnam.pub
// File: src/components/navigation/index.ts

export {
  default as DashboardNavigation,
  QuickActions,
} from "./DashboardNavigation";
export { default as DashboardRouter } from "./DashboardRouter";

// Navigation Types
export interface NavigationProps {
  currentDashboard: "family" | "individual" | "enhanced";
  userRole: "parent" | "child" | "guardian";
  onDashboardChange: (dashboard: string) => void;
}

export interface DashboardRoute {
  id: string;
  label: string;
  icon: string;
  component: React.ComponentType<any>;
  roles: string[];
  requiresAuth: boolean;
}
