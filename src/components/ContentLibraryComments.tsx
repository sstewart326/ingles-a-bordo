import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import {
  getCommentsForItem,
  getCommentCountForItem,
  createContentLibraryComment,
  addCommentVersion,
  deleteContentLibraryComment,
} from '../utils/contentLibraryCommentsUtils';
import type { ContentLibraryCommentResolved } from '../types/interfaces';
import { PaperAirplaneIcon, TrashIcon, PencilSquareIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { classNames } from '../styles/styleUtils';
import toast from 'react-hot-toast';

function getInitials(name: string | undefined): string {
  if (!name?.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function formatCommentDate(ts: unknown): string {
  const date =
    ts != null && typeof (ts as { toDate?: () => Date }).toDate === 'function'
      ? (ts as { toDate: () => Date }).toDate()
      : ts instanceof Date
        ? ts
        : new Date();
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export interface AuthorInfo {
  name: string;
  profilePictureUrl?: string | null;
}

interface ContentLibraryCommentsSectionProps {
  itemId: string;
  currentUserId: string;
  currentUserName: string;
  /** Used for legacy comments and the composer’s avatar when not stored on the comment. */
  currentUserProfilePictureUrl?: string | null;
  isTeacher: boolean;
  authors: Record<string, AuthorInfo>;
}

export default function ContentLibraryCommentsSection({
  itemId,
  currentUserId,
  currentUserName,
  currentUserProfilePictureUrl = null,
  isTeacher,
  authors,
}: ContentLibraryCommentsSectionProps) {
  const { language } = useLanguage();
  const t = useTranslation(language);

  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState<ContentLibraryCommentResolved[]>([]);
  const [commentCount, setCommentCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState<ContentLibraryCommentResolved | null>(null);
  const [editingComment, setEditingComment] = useState<ContentLibraryCommentResolved | null>(null);
  const [editText, setEditText] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchComments = useCallback(async () => {
    if (!itemId) return;
    setLoading(true);
    try {
      const list = await getCommentsForItem(itemId);
      setComments(list);
      setCommentCount(list.length);
    } catch (e) {
      toast.error(t.failedToLoad || 'Failed to load comments');
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [itemId, t.failedToLoad]);

  useEffect(() => {
    if (!itemId) return;
    let cancelled = false;
    getCommentCountForItem(itemId).then((count) => {
      if (!cancelled) setCommentCount(count);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [itemId]);

  useEffect(() => {
    if (expanded && itemId) {
      fetchComments();
      setNewCommentText('');
      setReplyingTo(null);
      setEditingComment(null);
      setEditText('');
    }
  }, [expanded, itemId, fetchComments]);

  const getAuthorDisplay = (comment: ContentLibraryCommentResolved): AuthorInfo => {
    const fromMap = authors[comment.authorId];
    const picFromDoc = comment.authorProfilePictureUrl?.trim() || null;
    const mapPic = fromMap?.profilePictureUrl ?? null;
    const resolvedPic = picFromDoc || mapPic || null;
    const nameFromDoc = comment.authorName?.trim();
    if (nameFromDoc) {
      return {
        name: nameFromDoc,
        profilePictureUrl: resolvedPic,
      };
    }
    if (fromMap) return fromMap;
    if (comment.authorId === currentUserId) {
      return {
        name: currentUserName,
        profilePictureUrl: picFromDoc || mapPic || currentUserProfilePictureUrl || null,
      };
    }
    return {
      name: t.commentAuthorUnknown,
      profilePictureUrl: picFromDoc || mapPic || null,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = newCommentText.trim();
    if (!text) return;
    setSubmitting(true);
    try {
      await createContentLibraryComment(itemId, {
        authorId: currentUserId,
        authorName: currentUserName,
        authorProfilePictureUrl: currentUserProfilePictureUrl ?? undefined,
        authorIsTeacher: isTeacher,
        content: text,
        parentCommentId: replyingTo?.id,
      });
      setNewCommentText('');
      setReplyingTo(null);
      await fetchComments();
      toast.success(t.success || 'Comment added');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (t.error || 'Error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSave = async () => {
    if (!editingComment || !editText.trim()) return;
    setSubmitting(true);
    try {
      await addCommentVersion(itemId, editingComment.id, editText.trim(), currentUserId);
      setEditingComment(null);
      setEditText('');
      await fetchComments();
      toast.success(t.success || 'Comment updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (t.error || 'Error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    setDeletingId(commentId);
    try {
      await deleteContentLibraryComment(itemId, commentId);
      await fetchComments();
      toast.success(t.success || 'Deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (t.error || 'Error'));
    } finally {
      setDeletingId(null);
    }
  };

  const topLevel = comments.filter((c) => !c.parentCommentId);
  const repliesByParent = comments.reduce<Record<string, ContentLibraryCommentResolved[]>>(
    (acc, c) => {
      if (c.parentCommentId) {
        if (!acc[c.parentCommentId]) acc[c.parentCommentId] = [];
        acc[c.parentCommentId].push(c);
      }
      return acc;
    },
    {}
  );

  /** Renders a comment and all nested replies (any depth). */
  const CommentWithReplies = ({
    comment: node,
  }: {
    comment: ContentLibraryCommentResolved;
  }) => {
    const childReplies = repliesByParent[node.id] ?? [];
    const author = getAuthorDisplay(node);
    const isEditingNode = editingComment?.id === node.id;
    return (
      <>
        {isEditingNode ? (
          <div className="flex gap-2 items-start">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm min-h-[60px]"
              disabled={submitting}
            />
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={handleEditSave}
                disabled={submitting || !editText.trim()}
                className="px-2 py-1 text-sm font-medium text-white bg-[var(--header-bg)] hover:bg-[var(--header-hover)] disabled:opacity-50 rounded"
              >
                {t.save}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingComment(null);
                  setEditText('');
                }}
                className="px-2 py-1 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded"
              >
                {t.cancel}
              </button>
            </div>
          </div>
        ) : (
          <CommentRow
            comment={node}
            authorName={author.name}
            authorProfileUrl={author.profilePictureUrl}
            currentUserId={currentUserId}
            onReply={node.deleted ? undefined : () => setReplyingTo(node)}
            onEdit={
              node.deleted
                ? undefined
                : node.authorId === currentUserId || isTeacher
                  ? () => {
                      setEditingComment(node);
                      setEditText(node.content);
                    }
                  : undefined
            }
            onDelete={
              node.deleted
                ? undefined
                : node.authorId === currentUserId || isTeacher
                  ? () => handleDelete(node.id)
                  : undefined
            }
            deleting={deletingId === node.id}
            formatDate={formatCommentDate}
            t={t}
          />
        )}
        {childReplies.map((child) => (
          <div key={child.id} className="ml-8 mt-2 pl-3 border-l-2 border-gray-200">
            <CommentWithReplies comment={child} />
          </div>
        ))}
      </>
    );
  };

  return (
    <div className="border-t border-gray-200 mt-3 pt-3">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className={classNames(
          'w-full flex items-center justify-between gap-2 text-left text-sm font-medium text-gray-700 hover:text-[var(--header-bg)] rounded py-1.5 px-0',
          'focus:outline-none focus:ring-0'
        )}
        aria-expanded={expanded}
      >
        <span>{t.contentLibraryComments} ({commentCount})</span>
        {expanded ? (
          <ChevronUpIcon className="h-4 w-4 flex-shrink-0" aria-hidden />
        ) : (
          <ChevronDownIcon className="h-4 w-4 flex-shrink-0" aria-hidden />
        )}
      </button>

      {expanded && (
        <div className="mt-3">
          {loading ? (
            <p className="text-gray-600 py-4">{t.loading}</p>
          ) : (
            <div className="space-y-3 max-h-48 overflow-y-auto py-2">
          {topLevel.length === 0 ? (
            <p className="text-gray-500 text-sm">{t.noComments}</p>
          ) : (
            topLevel.map((comment) => (
                <div key={comment.id} className="border-b border-gray-100 pb-2 last:border-0">
                  <CommentWithReplies comment={comment} />
                </div>
              ))
            )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-4 space-y-2">
            {replyingTo && (
              <div className="flex items-center justify-between text-sm text-gray-600 bg-gray-50 rounded px-2 py-1">
                <span>
                  {t.reply} → {getAuthorDisplay(replyingTo).name}
                </span>
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  className="text-gray-500 hover:underline"
                >
                  {t.cancel}
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                placeholder={t.commentPlaceholder}
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
                disabled={submitting}
              />
              <button
                type="submit"
                disabled={submitting || !newCommentText.trim()}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium text-white bg-[var(--header-bg)] hover:bg-[var(--header-hover)] disabled:opacity-50"
              >
                <PaperAirplaneIcon className="h-4 w-4" />
                {replyingTo ? t.reply : t.addComment}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function CommentRow({
  comment,
  authorName,
  authorProfileUrl,
  currentUserId,
  onReply,
  onEdit,
  onDelete,
  deleting,
  formatDate,
  t,
}: {
  comment: ContentLibraryCommentResolved;
  authorName: string;
  authorProfileUrl?: string | null;
  currentUserId: string;
  onReply?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  deleting: boolean;
  formatDate: (ts: unknown) => string;
  t: ReturnType<typeof useTranslation>;
}) {
  const isOwn = comment.authorId === currentUserId;

  return (
    <div className="flex gap-2">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--brand-color-light)] flex items-center justify-center text-sm font-medium text-[var(--header-bg)] overflow-hidden">
        {authorProfileUrl ? (
          <img src={authorProfileUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          getInitials(authorName)
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-gray-900">{isOwn ? t.you : authorName}</span>
          <span className="text-xs text-gray-500">{formatDate(comment.createdAt)}</span>
          {comment.hasEdits && (
            <span className="text-xs text-gray-500">({t.commentEdited})</span>
          )}
        </div>
        <p className={classNames('text-sm mt-0.5 whitespace-pre-wrap break-words', comment.deleted ? 'text-gray-500 italic' : 'text-gray-700')}>
          {comment.deleted ? t.commentDeleted : comment.content}
        </p>
        <div className="flex gap-2 mt-1">
          {onReply && (
            <button
              type="button"
              onClick={onReply}
              className="text-xs text-[var(--header-bg)] hover:underline"
            >
              {t.reply}
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="text-xs text-[var(--header-bg)] hover:underline inline-flex items-center gap-0.5"
            >
              <PencilSquareIcon className="h-3 w-3" />
              {t.edit}
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="text-xs text-red-600 hover:underline disabled:opacity-50 inline-flex items-center gap-0.5"
            >
              <TrashIcon className="h-3 w-3" />
              {t.delete}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
