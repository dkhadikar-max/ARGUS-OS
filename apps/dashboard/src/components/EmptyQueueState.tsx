export function EmptyQueueState() {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center">
      <p className="text-sm font-medium text-gray-900">Your queue is empty</p>
      <p className="mt-1 text-sm text-gray-500">
        New prospects will show up here as soon as ARGUS generates a verdict for them.
      </p>
    </div>
  );
}
