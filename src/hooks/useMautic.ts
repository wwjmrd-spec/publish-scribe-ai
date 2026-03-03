import { supabase } from '@/integrations/supabase/client';

interface MauticContactData {
  email: string;
  firstname?: string;
  lastname?: string;
  country?: string;
  company?: string;
  tags?: string[];
  custom_fields?: Record<string, unknown>;
}

export function useMautic() {
  const syncContact = async (contactData: MauticContactData) => {
    try {
      const { data, error } = await supabase.functions.invoke('mautic-sync', {
        body: {
          action: 'create_contact',
          data: contactData,
        },
      });
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Mautic contact sync failed:', err);
      // Non-blocking — don't interrupt user flow
      return null;
    }
  };

  const submitForm = async (formId: number, formData: Record<string, unknown>) => {
    try {
      const { data, error } = await supabase.functions.invoke('mautic-sync', {
        body: {
          action: 'submit_form',
          data: { formId, formData },
        },
      });
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Mautic form submission failed:', err);
      return null;
    }
  };

  const addToSegment = async (contactId: number, segmentId: number) => {
    try {
      const { data, error } = await supabase.functions.invoke('mautic-sync', {
        body: {
          action: 'add_to_segment',
          data: { contactId, segmentId },
        },
      });
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Mautic segment add failed:', err);
      return null;
    }
  };

  const sendEmail = async (emailId: number, contactId: number) => {
    try {
      const { data, error } = await supabase.functions.invoke('mautic-sync', {
        body: {
          action: 'send_email',
          data: { emailId, contactId },
        },
      });
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Mautic email send failed:', err);
      return null;
    }
  };

  return { syncContact, submitForm, addToSegment, sendEmail };
}
