import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import AuthorDashboard from "./pages/author/AuthorDashboard";
import SubmitArticle from "./pages/author/SubmitArticle";
import MyArticles from "./pages/author/MyArticles";
import Cart from "./pages/author/Cart";
import Certificates from "./pages/author/Certificates";
import Profile from "./pages/author/Profile";
import Subscription from "./pages/author/Subscription";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminArticles from "./pages/admin/AdminArticles";
import AdminAuthors from "./pages/admin/AdminAuthors";
import AdminDiscounts from "./pages/admin/AdminDiscounts";
import AdminFees from "./pages/admin/AdminFees";
import AdminAIReview from "./pages/admin/AdminAIReview";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            
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
              path="/author/articles" 
              element={
                <ProtectedRoute allowedRoles={['author']}>
                  <MyArticles />
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
              path="/admin/authors" 
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminAuthors />
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
              path="/admin/profile" 
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <Profile />
                </ProtectedRoute>
              } 
            />

            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
