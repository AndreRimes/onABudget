export default function Error({message}){
    return(
        <div className="w-2/3 text-center flex items-center justify-center bg-Error mt-2 rounded-lg">
            <h2 className="font-bold text-md">{message}.</h2>
        </div>
    )
}