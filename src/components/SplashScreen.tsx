import { useEffect, useState } from 'react';

interface SplashScreenProps {
  onLoadComplete: () => void;
}

const SplashScreen = ({ onLoadComplete }: SplashScreenProps) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onLoadComplete, 500); // Небольшая задержка для плавного исчезновения
    }, 3000);

    return () => clearTimeout(timer);
  }, [onLoadComplete]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950 transition-opacity duration-500">
      <div className="relative flex items-center justify-center">
        {/* Анимированные кружки */}
        <div className="absolute animate-spin-slow">
          <div className="circle-ring ring-1" />
        </div>
        <div className="absolute animate-spin-reverse-slow">
          <div className="circle-ring ring-2" />
        </div>
        <div className="absolute animate-spin-medium">
          <div className="circle-ring ring-3" />
        </div>
        <div className="absolute animate-pulse-slow">
          <div className="circle-ring ring-4" />
        </div>
        
        {/* Центральное изображение */}
        <img
          src="/splash_screen.png"
          alt="Splash Screen"
          className="relative z-10 w-64 h-64 object-contain animate-fade-in"
        />
      </div>
    </div>
  );
};

export default SplashScreen;
