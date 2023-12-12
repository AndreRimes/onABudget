export default function Error({message}){
    return(
        <div className="w-1/2 flex items-center justify-center bg-Error mt-2 rounded-lg">
            <h2 className="font-bold text-lg">{message}</h2>
        </div>
    )
}