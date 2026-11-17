import { Navigate,useParams } from 'react-router-dom';
export const BrowserMonitorPage = () => {
  const { id }=useParams();
  return <Navigate to={'/applications/'+id} replace/>;
};
