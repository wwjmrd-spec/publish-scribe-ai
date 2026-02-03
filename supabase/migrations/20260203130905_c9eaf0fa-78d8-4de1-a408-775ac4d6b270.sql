-- Create custom types
CREATE TYPE public.user_role AS ENUM ('author', 'admin');
CREATE TYPE public.article_status AS ENUM ('submitted', 'under_review', 'pending_fee', 'paid', 'payment_under_review', 'failed_payment', 'published', 'rejected');
CREATE TYPE public.payment_status AS ENUM ('pending', 'success', 'failed', 'under_review');
CREATE TYPE public.currency_type AS ENUM ('INR', 'USD');
CREATE TYPE public.payment_gateway AS ENUM ('razorpay', 'paypal');
CREATE TYPE public.discount_type AS ENUM ('percentage', 'fixed');
CREATE TYPE public.discount_currency AS ENUM ('INR', 'USD', 'BOTH');
CREATE TYPE public.coauthor_payment_status AS ENUM ('pending', 'paid', 'failed');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  country TEXT,
  is_indian BOOLEAN DEFAULT FALSE,
  affiliation TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_roles table for role management
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role user_role NOT NULL DEFAULT 'author',
  UNIQUE (user_id, role)
);

-- Create articles table
CREATE TABLE public.articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number TEXT UNIQUE NOT NULL,
  author_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  abstract TEXT,
  keywords TEXT[],
  document_url TEXT,
  submission_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status article_status DEFAULT 'submitted',
  review_report_url TEXT,
  certificate_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create co_authors table
CREATE TABLE public.co_authors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID REFERENCES public.articles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  affiliation TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create co_author_certificates table
CREATE TABLE public.co_author_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID REFERENCES public.articles(id) ON DELETE CASCADE NOT NULL,
  co_author_id UUID REFERENCES public.co_authors(id) ON DELETE CASCADE NOT NULL,
  payment_status coauthor_payment_status DEFAULT 'pending',
  certificate_url TEXT,
  payment_id TEXT,
  amount_paid DECIMAL(10, 2),
  currency currency_type,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create payments table
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  article_ids UUID[] NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency currency_type NOT NULL,
  payment_gateway payment_gateway NOT NULL,
  payment_status payment_status DEFAULT 'pending',
  transaction_id TEXT,
  discount_code TEXT,
  discount_amount DECIMAL(10, 2) DEFAULT 0,
  final_amount DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create publication_fees table
CREATE TABLE public.publication_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indian_fee DECIMAL(10, 2) DEFAULT 2500,
  international_fee DECIMAL(10, 2) DEFAULT 79,
  indian_coauthor_fee DECIMAL(10, 2) DEFAULT 500,
  international_coauthor_fee DECIMAL(10, 2) DEFAULT 10,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES public.profiles(id)
);

-- Create discount_codes table
CREATE TABLE public.discount_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  discount_type discount_type NOT NULL,
  discount_value DECIMAL(10, 2) NOT NULL,
  currency discount_currency NOT NULL,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  usage_limit INTEGER,
  used_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create sequence for reference numbers
CREATE SEQUENCE public.article_ref_seq START 1;

-- Create function to generate reference number
CREATE OR REPLACE FUNCTION public.generate_reference_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref_num TEXT;
  current_year TEXT;
  seq_num INTEGER;
BEGIN
  current_year := EXTRACT(YEAR FROM NOW())::TEXT;
  seq_num := nextval('public.article_ref_seq');
  ref_num := 'ART-' || current_year || '-' || LPAD(seq_num::TEXT, 4, '0');
  NEW.reference_number := ref_num;
  RETURN NEW;
END;
$$;

-- Create trigger for auto-generating reference numbers
CREATE TRIGGER generate_article_reference
  BEFORE INSERT ON public.articles
  FOR EACH ROW
  WHEN (NEW.reference_number IS NULL OR NEW.reference_number = '')
  EXECUTE FUNCTION public.generate_reference_number();

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Create triggers for updated_at
CREATE TRIGGER update_articles_updated_at
  BEFORE UPDATE ON public.articles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Security definer function to check user role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role user_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Security definer function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.co_authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.co_author_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- User roles policies
CREATE POLICY "Users can view their own role"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow new users to insert their own role on signup
CREATE POLICY "Users can insert their own role"
  ON public.user_roles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Articles policies
CREATE POLICY "Authors can view their own articles"
  ON public.articles FOR SELECT
  USING (author_id = auth.uid());

CREATE POLICY "Admins can view all articles"
  ON public.articles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authors can insert their own articles"
  ON public.articles FOR INSERT
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors can update their own articles"
  ON public.articles FOR UPDATE
  USING (author_id = auth.uid());

CREATE POLICY "Admins can update all articles"
  ON public.articles FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- Co-authors policies
CREATE POLICY "Users can view co-authors of their articles"
  ON public.co_authors FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.articles
      WHERE articles.id = co_authors.article_id
      AND articles.author_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all co-authors"
  ON public.co_authors FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authors can insert co-authors for their articles"
  ON public.co_authors FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.articles
      WHERE articles.id = article_id
      AND articles.author_id = auth.uid()
    )
  );

CREATE POLICY "Authors can update co-authors for their articles"
  ON public.co_authors FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.articles
      WHERE articles.id = co_authors.article_id
      AND articles.author_id = auth.uid()
    )
  );

CREATE POLICY "Authors can delete co-authors for their articles"
  ON public.co_authors FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.articles
      WHERE articles.id = co_authors.article_id
      AND articles.author_id = auth.uid()
    )
  );

-- Co-author certificates policies
CREATE POLICY "Users can view their article co-author certificates"
  ON public.co_author_certificates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.articles
      WHERE articles.id = co_author_certificates.article_id
      AND articles.author_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all co-author certificates"
  ON public.co_author_certificates FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert co-author certificates for their articles"
  ON public.co_author_certificates FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.articles
      WHERE articles.id = article_id
      AND articles.author_id = auth.uid()
    )
  );

CREATE POLICY "Users can update co-author certificates for their articles"
  ON public.co_author_certificates FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.articles
      WHERE articles.id = co_author_certificates.article_id
      AND articles.author_id = auth.uid()
    )
  );

-- Payments policies
CREATE POLICY "Users can view their own payments"
  ON public.payments FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all payments"
  ON public.payments FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert their own payments"
  ON public.payments FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can update payments"
  ON public.payments FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- Publication fees policies (read-only for authors, full access for admins)
CREATE POLICY "Anyone can view publication fees"
  ON public.publication_fees FOR SELECT
  USING (TRUE);

CREATE POLICY "Admins can manage publication fees"
  ON public.publication_fees FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Discount codes policies
CREATE POLICY "Anyone can view active discount codes"
  ON public.discount_codes FOR SELECT
  USING (is_active = TRUE AND NOW() BETWEEN start_date AND end_date);

CREATE POLICY "Admins can view all discount codes"
  ON public.discount_codes FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage discount codes"
  ON public.discount_codes FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Insert default publication fees
INSERT INTO public.publication_fees (indian_fee, international_fee, indian_coauthor_fee, international_coauthor_fee)
VALUES (2500, 79, 500, 10);