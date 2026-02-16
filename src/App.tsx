import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import OnboardingPage from "./pages/OnboardingPage";
import DashboardPage from "./pages/DashboardPage";
import WorkoutPage from "./pages/WorkoutPage";
import DietPage from "./pages/DietPage";
import RunningPage from "./pages/RunningPage";
import ProfilePage from "./pages/ProfilePage";
import AssistantPage from "./pages/AssistantPage";
import SocialSectionPage from "./pages/SocialSectionPage";
import NotFound from "./pages/NotFound";
import { ProfileProvider } from "@/context/ProfileContext";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ProfileProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/workout" element={<WorkoutPage />} />
            <Route path="/diet" element={<DietPage />} />
            <Route path="/running" element={<RunningPage />} />
            <Route path="/assistant" element={<AssistantPage />} />
            <Route path="/friends" element={<SocialSectionPage section="friends" />} />
            <Route path="/clans" element={<SocialSectionPage section="clans" />} />
            <Route path="/chat" element={<SocialSectionPage section="chat" />} />
            <Route path="/notifications" element={<SocialSectionPage section="notifications" />} />
            <Route path="/social" element={<Navigate to="/friends" replace />} />
            <Route path="/profile" element={<ProfilePage />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ProfileProvider>
  </QueryClientProvider>
);

export default App;
