import { createClient } from '../src/index';
import type { CommentThread, Reply, UserSummary, CommunitySearchOptions, CommunitySearchResult, PaginatedResponse } from '../src/index';

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
  const options: CommunitySearchOptions = { query: 'hello', sort: 'newest', authorId: 'kajabi-archive:profile' };
  const search: PaginatedResponse<CommunitySearchResult> = await bold.community.search(options);
  search.data.forEach(hit => {
    const commentId: string | null = hit.commentId;
    const parentAuthor: string = hit.postAuthorId;
    const ancestors: string[] = hit.ancestorAuthorIds;
    const archived: boolean = hit.author.archived;
    const avatar: string | null = hit.author.avatarUrl;
    // @ts-expect-error A post hit has no comment ID.
    const requiredCommentId: string = hit.commentId;
  });
  // @ts-expect-error Query is required.
  bold.community.search({});
  // @ts-expect-error Unsupported sort order.
  bold.community.search({ query: 'hello', sort: 'oldest' });
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
