import Image from "next/image";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center min-h-screen bg-zinc-950 font-sans text-zinc-50">
      <main className="flex flex-1 w-full max-w-4xl flex-col items-center py-16 px-8 gap-12">
        <h1 className="text-4xl font-bold tracking-tight text-white">
          MovieAnimation Project
        </h1>
        
        <div className="flex flex-col items-center gap-4 w-full">
          <h2 className="text-2xl font-semibold text-zinc-300">Sarah & Ben Cinematic V2 (LatentSync)</h2>
          <p className="text-zinc-400 text-center max-w-2xl">
            This is the cinematic lip-sync test using ByteDance's LatentSync model via fal.ai, combined with dynamic Luma camera angles.
          </p>
          
          <div className="w-full max-w-3xl aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border border-zinc-800 mt-4">
            <video 
              controls 
              className="w-full h-full object-cover"
              poster="/animations/poster.jpg"
              preload="metadata"
            >
              <source src="/animations/sarah_ben_cinematic_v2.mp4" type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>
        </div>
      </main>
    </div>
  );
}
