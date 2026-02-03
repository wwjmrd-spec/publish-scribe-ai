import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import AuthorDashboard from "./pages/author/AuthorDashboard";
import SubmitArticle from "./pages/author/SubmitArticle";
import MyArticles from "./pages/author/MyArticles";
import Cart from "./pages/author/Cart";
import Certificates from "./pages/author/Certificates";
import AdminDashboard from "./pages/admin/AdminDashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
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
            
            {/* Admin Routes */}
            <Route 
              path="/admin" 
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminDashboard />
                </ProtectedRoute>
              } 
            />

            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
