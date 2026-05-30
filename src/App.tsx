import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { CartProvider } from "@/contexts/CartContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import AuthorDashboard from "./pages/author/AuthorDashboard";
import SubmitArticle from "./pages/author/SubmitArticle";
import ResubmitArticle from "./pages/author/ResubmitArticle";
import AICorrectManuscript from "./pages/author/AICorrectManuscript";
import AIWriteArticle from "./pages/author/AIWriteArticle";
import MyArticles from "./pages/author/MyArticles";
import Cart from "./pages/author/Cart";
import Certificates from "./pages/author/Certificates";
import Profile from "./pages/author/Profile";
import Subscription from "./pages/author/Subscription";
import Rewards from "./pages/author/Rewards";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminArticles from "./pages/admin/AdminArticles";
import AdminAuthors from "./pages/admin/AdminAuthors";
import AdminDiscounts from "./pages/admin/AdminDiscounts";
import AdminFees from "./pages/admin/AdminFees";
import AdminAIReview from "./pages/admin/AdminAIReview";
import AdminArticleDetail from "./pages/admin/AdminArticleDetail";
import AdminFormatting from "./pages/admin/AdminFormatting";
import AdminGalleyProofs from "./pages/admin/AdminGalleyProofs";
import AdminAuthorDetail from "./pages/admin/AdminAuthorDetail";
import AdminReminderSettings from "./pages/admin/AdminReminderSettings";
import AdminUSDTPayments from "./pages/admin/AdminUSDTPayments";
import AdminNotifications from "./pages/admin/AdminNotifications";
import AdminBugReports from "./pages/admin/AdminBugReports";
import AdminRevenue from "./pages/admin/AdminRevenue";
import AdminPaymentActivity from "./pages/admin/AdminPaymentActivity";
import AdminEmailLog from "./pages/admin/AdminEmailLog";
import AdminProSubscribers from "./pages/admin/AdminProSubscribers";
import AdminAISettings from "./pages/admin/AdminAISettings";
import AdminPublishQueue from "./pages/admin/AdminPublishQueue";
import AdminPublicationForm from "./pages/admin/AdminPublicationForm";
import AdminSubmitForAuthor from "./pages/admin/AdminSubmitForAuthor";
import NotFound from "./pages/NotFound";
import { ReferralPopup } from "./components/referral/ReferralPopup";
import { CookieConsent } from "./components/CookieConsent";
import { CountryCollectionModal } from "./components/auth/CountryCollectionModal";
import { MauticTrackingProvider } from "./components/MauticTrackingProvider";
import { BugReporter } from "./components/BugReporter";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
    <AuthProvider>
    <CartProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <ReferralPopup />
        <CookieConsent />
        <CountryCollectionModal />
        <BugReporter />
        <BrowserRouter>
        <MauticTrackingProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            
            {/* Author Routes */}
            <Route 
              path="/author" 
              element={
                <ProtectedRoute allowedRoles={['author']}>
                  <AuthorDashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/author/submit" 
              element={
                <ProtectedRoute allowedRoles={['author']}>
                  <SubmitArticle />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/author/resubmit" 
              element={
                <ProtectedRoute allowedRoles={['author']}>
                  <ResubmitArticle />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/author/articles" 
              element={
                <ProtectedRoute allowedRoles={['author']}>
                  <MyArticles />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/author/ai-correct/:articleId" 
              element={
                <ProtectedRoute allowedRoles={['author']}>
                  <AICorrectManuscript />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/author/ai-write" 
              element={
                <ProtectedRoute allowedRoles={['author']}>
                  <AIWriteArticle />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/author/cart" 
              element={
                <ProtectedRoute allowedRoles={['author']}>
                  <Cart />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/author/certificates" 
              element={
                <ProtectedRoute allowedRoles={['author']}>
                  <Certificates />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/author/profile" 
              element={
                <ProtectedRoute allowedRoles={['author']}>
                  <Profile />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/author/subscription" 
              element={
                <ProtectedRoute allowedRoles={['author']}>
                  <Subscription />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/author/rewards" 
              element={
                <ProtectedRoute allowedRoles={['author']}>
                  <Rewards />
                </ProtectedRoute>
              } 
            />
            
            {/* Admin Routes */}
            <Route 
              path="/admin" 
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminDashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/articles" 
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminArticles />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/articles/:articleId" 
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminArticleDetail />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/authors" 
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminAuthors />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/authors/:authorId" 
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminAuthorDetail />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/discounts" 
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminDiscounts />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/fees" 
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminFees />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/ai-review" 
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminAIReview />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/formatting" 
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminFormatting />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/galley-proofs" 
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminGalleyProofs />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/reminders" 
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminReminderSettings />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/usdt-payments" 
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminUSDTPayments />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/notifications" 
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminNotifications />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/bug-reports" 
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminBugReports />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/revenue" 
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminRevenue />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/payment-activity" 
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminPaymentActivity />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/profile" 
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <Profile />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/email-log" 
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminEmailLog />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/pro-subscribers" 
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminProSubscribers />
                </ProtectedRoute>
              } 
            />
            <Route
              path="/admin/publish-queue"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminPublishQueue />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/publish-queue/:articleId/publication-form"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminPublicationForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/ai-settings"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminAISettings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/submit-for-author"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminSubmitForAuthor />
                </ProtectedRoute>
              }
            />

            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </MauticTrackingProvider>
        </BrowserRouter>
      </TooltipProvider>
    </CartProvider>
    </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
