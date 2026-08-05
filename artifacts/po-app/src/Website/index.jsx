import "./website.css";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import LandingPage from "./pages/LandingPage";

/** Exact BizOne landing page from Downloads/BizOne_landing_page */
export default function WebsiteLanding() {
  return (
    <div className="bizone-landing">
      <Navbar />
      <LandingPage />
      <Footer />
    </div>
  );
}
