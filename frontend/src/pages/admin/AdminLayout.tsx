import { Outlet } from 'react-router';
import { Page } from '../../components/layout/AppShell';

/** Le pagine di amministrazione vivono nel guscio comune: il menu è quello laterale. */
export function AdminLayout() {
  return (
    <Page wide>
      <Outlet />
    </Page>
  );
}
