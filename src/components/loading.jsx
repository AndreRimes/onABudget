export default function Loading() {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center">
            <div className="flex flex-row">
                <span className="animate-loading bg-purple-600 w-8 h-8 ml-2 bg-ACMDARK rounded-full inline "></span>
                <span className="animate-loading bg-purple-600 w-8 h-8 ml-2 bg-ACMDARK rounded-full inline" style={{ animationDelay: '0.2s' }}></span>
                <spna className="animate-loading bg-purple-600 w-8 h-8 ml-2 bg-ACMDARK rounded-full inline" style={{ animationDelay: '0.4s' }}></spna>
            </div>
        </div>
    )
}