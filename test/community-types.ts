import { createClient } from '../src/index';
import type { CommentThread, Reply, UserSummary } from '../src/index';

const bold = createClient('type-test-key');

function checkComment(comment: CommentThread | Reply): void {
  const depth: number = comment.depth;
  const updatedAt: string = comment.updatedAt;
  const author: UserSummary | null = comment.author;
  const replies: Reply[] = comment.replies;
  // @ts-expect-error Deleted placeholders have no author.
  const liveAuthor: UserSummary = comment.author;
  replies.forEach(reply => {
    const parentId: string | undefined = reply.parentCommentId;
    // @ts-expect-error The API can omit parent IDs when nesting replies.
    const requiredParentId: string = reply.parentCommentId;
    checkComment(reply);
  });
}

async function checkResponses(): Promise<void> {
  const created = await bold.community.comments.create('viewer', 'post', { content: 'Hello' });
  const updated = await bold.community.comments.update('viewer', 'comment', { content: 'Edited' });
  checkComment(created.data);
  checkComment(updated.data);
  const count: number = created.data.reactions.count;
  // @ts-expect-error Legacy flat reaction counts are not in API responses.
  created.data.reactionsCount;
  const post = await bold.community.posts.get('post');
  post.data.comments.items?.forEach(checkComment);
}
